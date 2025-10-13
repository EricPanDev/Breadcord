(function () {
  if (typeof window === 'undefined') return;

  const STYLE_PATH = 'plugins/breadcord_messagecomposer/composer.css';
  const COMPOSER_CLASS = 'breadcord-message-composer';
  const MESSAGE_CONTAINER_SELECTOR = '[data-container-id="breadcord-message-container"]';
  const MESSAGE_LIST_SELECTOR = '[data-container-id="breadcord-message-list"]';
  const HEADER_SELECTOR = '[data-type="message-header"]';
  const SLASH_MENU_CLASS = `${COMPOSER_CLASS}__slash-menu`;
  const SLASH_COMMAND_CACHE_TTL = 60000;
  const slashCommandCache = new Map();
  const pendingSlashRequests = new Map();
  let gatewayListenerAttached = false;
  let gatewaySessionId = null;

  let composerState = {
    sending: false,
    root: null,
    textarea: null,
    errorEl: null,
    attachments: [],
    attachmentsList: null,
    inputShell: null,
    currentChannelId: null,
    slashMenu: null,
    slashTabs: null,
    slashCommandsContainer: null,
    slashStatus: null,
    slashActiveAppId: null,
    slashData: null,
    slashQuery: '',
    slashGuildId: null,
    slashSelectedCommand: null,
    slashFormContainer: null,
    slashFormState: null,
    inlineChoicesMenu: null,
    currentOptionContext: null, // Track which option we're filling
    autocompleteDebounceTimer: null,
    autocompleteCache: new Map(),
    pendingAutocompleteNonce: null, // Track pending autocomplete request
  };

  function handleGatewayPacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.t === 'READY' && packet.d?.session_id) {
      gatewaySessionId = packet.d.session_id;
    } else if (packet.t === 'RESUMED' && packet.d?.session_id) {
      gatewaySessionId = packet.d.session_id;
    } else if (!gatewaySessionId && packet.d?.session_id) {
      gatewaySessionId = packet.d.session_id;
    } else if (packet.t === 'APPLICATION_COMMAND_AUTOCOMPLETE_RESPONSE') {
      handleAutocompleteResponse(packet.d);
    }
  }

  function handleAutocompleteResponse(data) {
    // Check if this response matches our pending request
    if (!data || !composerState.pendingAutocompleteNonce) return;
    
    if (data.nonce && data.nonce === composerState.pendingAutocompleteNonce) {
      composerState.pendingAutocompleteNonce = null;
      
      // Get current context to make sure we're still in the same field
      if (!composerState.textarea || !composerState.slashSelectedCommand) return;
      
      const text = composerState.textarea.value;
      const cursorPos = composerState.textarea.selectionStart;
      const context = getCurrentOptionContext(text, cursorPos);
      
      if (!context || !context.option) {
        hideInlineChoicesMenu();
        return;
      }
      
      // Parse choices from response
      const choices = Array.isArray(data.choices) ? data.choices : [];
      
      if (choices.length > 0) {
        showInlineChoicesMenu(choices, context);
      } else {
        hideInlineChoicesMenu();
      }
    }
  }

  function ensureStylesheet() {
    if (document.querySelector(`link[data-breadcord-composer="true"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_PATH;
    link.dataset.breadcordComposer = 'true';
    link.addEventListener('error', () => console.warn('[breadcord_messagecomposer] Failed to load stylesheet at', STYLE_PATH), { once: true });
    document.head.appendChild(link);
  }

  function waitForElement(selector, timeoutMs = 10000) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let timeoutHandle = null;
      const observer = new MutationObserver(() => {
        const node = document.querySelector(selector);
        if (node) {
          clearTimeout(timeoutHandle);
          observer.disconnect();
          resolve(node);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });

      timeoutHandle = setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector) || null);
      }, timeoutMs);
    });
  }

  function getMessageListDom() {
    return document.querySelector(MESSAGE_LIST_SELECTOR);
  }

  function getCurrentChannelId() {
    const list = getMessageListDom();
    if (!list) return null;
    const id = list.dataset.channelId || list.dataset.channelid || null;
    return id ? String(id) : null;
  }

  function getCurrentGuildId() {
    const list = getMessageListDom();
    if (!list) return null;
    const id = list.dataset.guildId || list.dataset.guildid || null;
    return id ? String(id) : null;
  }

  function getCurrentChannelLabel() {
    const header = document.querySelector(HEADER_SELECTOR);
    if (!header) return '#channel';
    const text = header.textContent || header.innerText || '#channel';
    const trimmed = text.trim();
    return trimmed.length ? trimmed : '#channel';
  }

  function setSending(isSending) {
    composerState.sending = Boolean(isSending);
    const channelId = getCurrentChannelId();
    const hasChannel = Boolean(channelId);
    const disabled = composerState.sending || !hasChannel;
    if (composerState.root) {
      composerState.root.classList.toggle('is-sending', composerState.sending);
    }
    if (composerState.inputShell) {
      composerState.inputShell.classList.toggle('is-disabled', disabled);
    }
    if (composerState.textarea) {
      composerState.textarea.disabled = disabled;
      composerState.textarea.classList.toggle('is-disabled', disabled);
    }
    if (composerState.attachmentsList) {
      const buttons = composerState.attachmentsList.querySelectorAll('button');
      buttons.forEach((button) => {
        button.disabled = composerState.sending;
      });
    }
    if (composerState.slashFormContainer) {
      const controls = composerState.slashFormContainer.querySelectorAll('input, select');
      controls.forEach((control) => {
        control.disabled = composerState.sending;
      });
    }
  }

  function showError(message) {
    if (!composerState.errorEl) return;
    composerState.errorEl.textContent = message || '';
    composerState.errorEl.hidden = !message;
  }

  function clearError() {
    showError('');
  }

  function renderAttachments() {
    if (!composerState.attachmentsList) return;
    const attachments = Array.isArray(composerState.attachments) ? composerState.attachments : [];
    composerState.attachmentsList.innerHTML = '';
    if (!attachments.length) {
      composerState.attachmentsList.hidden = true;
      return;
    }

    attachments.forEach((attachment, index) => {
      const item = document.createElement('div');
      item.className = `${COMPOSER_CLASS}__attachment`;

      const name = document.createElement('span');
      name.className = `${COMPOSER_CLASS}__attachment-name`;
      name.textContent = attachment?.name || `file-${index}`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = `${COMPOSER_CLASS}__attachment-remove`;
      removeButton.setAttribute('aria-label', `Remove ${name.textContent}`);
      removeButton.textContent = 'Remove';
      removeButton.disabled = composerState.sending;
      removeButton.addEventListener('click', () => {
        if (!Array.isArray(composerState.attachments)) return;
        composerState.attachments.splice(index, 1);
        renderAttachments();
      });

      item.appendChild(name);
      item.appendChild(removeButton);
      composerState.attachmentsList.appendChild(item);
    });

    composerState.attachmentsList.hidden = false;
  }

  function addAttachments(newAttachments) {
    if (!Array.isArray(newAttachments) || !newAttachments.length) return;
    if (!Array.isArray(composerState.attachments)) {
      composerState.attachments = [];
    }
    composerState.attachments.push(...newAttachments);
    renderAttachments();
  }

  function clearAttachments() {
    if (Array.isArray(composerState.attachments) && composerState.attachments.length) {
      composerState.attachments.length = 0;
    } else {
      composerState.attachments = [];
    }
    renderAttachments();
  }

  function createSlashMenuDom() {
    const wrapper = document.createElement('div');
    wrapper.className = SLASH_MENU_CLASS;
    wrapper.hidden = true;

    const tabs = document.createElement('div');
    tabs.className = `${COMPOSER_CLASS}__slash-tabs`;

    const status = document.createElement('div');
    status.className = `${COMPOSER_CLASS}__slash-status`;
    status.hidden = true;

    const commandsContainer = document.createElement('div');
    commandsContainer.className = `${COMPOSER_CLASS}__slash-commands`;

    wrapper.appendChild(tabs);
    wrapper.appendChild(status);
    wrapper.appendChild(commandsContainer);

    return { wrapper, tabs, status, commandsContainer };
  }

  function extractSlashQuery(value) {
    if (typeof value !== 'string' || !value.startsWith('/')) return '';
    const afterSlash = value.slice(1);
    const trimmed = afterSlash.replace(/^\s+/, '');
    const segment = trimmed.split(/\s/)[0] || '';
    return segment.trim();
  }

  function resolveApplicationName(command, applicationMeta = null) {
    const candidates = [
      applicationMeta?.name,
      command?.application?.name,
      command?.__breadcordApplication?.name,
      command?.application?.bot?.global_name,
      command?.application?.bot?.username,
      applicationMeta?.bot?.global_name,
      applicationMeta?.bot?.username,
      command?.integration_owner?.name,
      command?.integration?.name,
      command?.name,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
    return 'Unknown Bot';
  }

  function normalizeCommandName(command) {
    if (!command) return '';
    const name = command.name_localized || command.name;
    return typeof name === 'string' ? name : '';
  }

  function normalizeCommandDescription(command) {
    if (!command) return '';
    const description = command.description_localized || command.description;
    return typeof description === 'string' ? description : '';
  }

  function extractSlashCommandList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.application_commands)) return payload.application_commands;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.commands)) return payload.commands;
    return [];
  }

  function createSlashCommandGroups(commands, applicationsById = new Map()) {
    const seen = new Map();
    const groups = [];
    if (Array.isArray(commands)) {
      for (const command of commands) {
        if (!command) continue;
        const rawId = command.application_id || command.application?.id || 'unknown';
        const applicationId = String(rawId);
        const applicationMeta = applicationsById.get(applicationId) || null;
        if (applicationMeta && typeof command === 'object') {
          command.__breadcordApplication = applicationMeta;
        }
        let group = seen.get(applicationId);
        if (!group) {
          group = {
            applicationId,
            applicationName: resolveApplicationName(command, applicationMeta),
            application: applicationMeta,
            commands: [],
          };
          seen.set(applicationId, group);
          groups.push(group);
        }
        group.commands.push(command);
      }
    }

    groups.sort((a, b) => a.applicationName.localeCompare(b.applicationName));
    for (const group of groups) {
      group.commands.sort((a, b) => normalizeCommandName(a).localeCompare(normalizeCommandName(b)));
    }
    return groups;
  }

  function getCachedSlashCommands(guildId) {
    if (!guildId) return null;
    const entry = slashCommandCache.get(guildId);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > SLASH_COMMAND_CACHE_TTL) {
      slashCommandCache.delete(guildId);
      return null;
    }
    return entry;
  }

  async function loadSlashCommandsForGuild(guildId, channelId = null) {
    if (!guildId) return null;
    const cached = getCachedSlashCommands(guildId);
    if (cached) return cached;
    if (pendingSlashRequests.has(guildId)) {
      return pendingSlashRequests.get(guildId);
    }

    const fetchPromise = (async () => {
      try {
        const searchParams = new URLSearchParams();
        searchParams.set('type', '1');
        searchParams.set('application_type', '0');
        searchParams.set('limit', '100');
        searchParams.set('include_applications', 'true');
        searchParams.set('query', '');

        const attempts = [`/guilds/${guildId}/application-command-index`];
        if (channelId) {
          attempts.push(
            `/channels/${channelId}/application-commands/search?${searchParams.toString()}`,
            `/channels/${channelId}/application-commands?with_applications=true&limit=100`
          );
        }

        let lastError = null;
        let payload = null;
        for (const path of attempts) {
          try {
            const { data } = await BreadAPI.rest.request({ method: 'GET', path });
            payload = data;
            break;
          } catch (error) {
            lastError = error;
            if (error?.status === 401) break;
          }
        }

        if (!payload) {
          if (lastError && (lastError.status === 404 || lastError?.data?.code === 10003)) {
            const entry = {
              guildId,
              commands: [],
              groups: [],
              applications: [],
              fetchedAt: Date.now(),
            };
            slashCommandCache.set(guildId, entry);
            return entry;
          }
          throw lastError || new Error('Unable to load slash commands.');
        }

        const applications = Array.isArray(payload?.applications) ? payload.applications : [];
        const applicationMap = new Map(applications.map((app) => [String(app?.id), app]));
        const candidates = extractSlashCommandList(payload);
        const groups = createSlashCommandGroups(candidates, applicationMap);
        const entry = {
          guildId,
          commands: candidates,
          groups,
          applications,
          fetchedAt: Date.now(),
        };
        slashCommandCache.set(guildId, entry);
        return entry;
      } finally {
        pendingSlashRequests.delete(guildId);
      }
    })();

    pendingSlashRequests.set(guildId, fetchPromise);
    return fetchPromise;
  }

  function setSlashStatus(message, { loading = false } = {}) {
    if (!composerState.slashStatus) return;
    const statusEl = composerState.slashStatus;
    if (!message) {
      statusEl.hidden = true;
      statusEl.classList.remove('is-loading');
      statusEl.textContent = '';
      if (composerState.slashCommandsContainer) {
        composerState.slashCommandsContainer.hidden = false;
      }
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-loading', Boolean(loading));
    if (composerState.slashCommandsContainer) {
      composerState.slashCommandsContainer.hidden = true;
    }
  }

  function formatSlashLoadError(err) {
    if (!err) return 'Failed to load slash commands.';
    const status = typeof err.status === 'number' ? err.status : err?.result?.status;
    const code = err?.data?.code || err?.result?.data?.code;
    const message = err?.data?.message || err?.message || err?.result?.error;

    if (status === 403 || code === 50001 || code === 50013) {
      return 'Missing access to slash commands in this channel.';
    }
    if (status === 404) {
      return 'Slash commands are not available in this channel.';
    }
    if (typeof message === 'string' && message.trim().length) {
      return `Failed to load slash commands: ${message.trim()}`;
    }
    if (typeof status === 'number') {
      return `Failed to load slash commands (status ${status}).`;
    }
    return 'Failed to load slash commands.';
  }

  function showSlashMenu() {
    if (composerState.slashMenu) {
      composerState.slashMenu.hidden = false;
    }
  }

  function hideSlashMenu() {
    if (composerState.slashMenu) {
      composerState.slashMenu.hidden = true;
    }
    if (composerState.slashTabs) {
      composerState.slashTabs.innerHTML = '';
    }
    if (composerState.slashCommandsContainer) {
      composerState.slashCommandsContainer.hidden = false;
      composerState.slashCommandsContainer.innerHTML = '';
    }
    setSlashStatus('');
    composerState.slashGuildId = null;
  }

  function clearSlashCommandSelection() {
    composerState.slashSelectedCommand = null;
    composerState.slashFormState = null;
    composerState.slashQuery = '';
    if (composerState.slashFormContainer) {
      composerState.slashFormContainer.hidden = true;
      composerState.slashFormContainer.innerHTML = '';
    }
    hideInlineChoicesMenu();
    hideCommandHelper();
  }

  function resetSlashMenuState() {
    composerState.slashActiveAppId = null;
    composerState.slashData = null;
    composerState.slashQuery = '';
    composerState.slashGuildId = null;
    hideSlashMenu();
    clearSlashCommandSelection();
    hideInlineChoicesMenu();
  }

  function parseInlineCommand(text) {
    // Parse text like "/command subcommand option1:value1 option2:value3"
    if (!text || !text.startsWith('/')) return null;
    
    // Remove leading /
    const withoutSlash = text.slice(1);
    
    // Find the first colon which indicates start of options
    const firstColonIndex = withoutSlash.indexOf(':');
    
    let commandPart, optionsPart;
    if (firstColonIndex === -1) {
      // No options, everything is command name
      commandPart = withoutSlash.trim();
      optionsPart = '';
    } else {
      // Find where the option name starts (word before the colon)
      const beforeColon = withoutSlash.slice(0, firstColonIndex);
      const lastSpaceBeforeColon = beforeColon.lastIndexOf(' ');
      
      if (lastSpaceBeforeColon === -1) {
        // No space found, weird format
        commandPart = withoutSlash.trim();
        optionsPart = '';
      } else {
        commandPart = beforeColon.slice(0, lastSpaceBeforeColon).trim();
        optionsPart = withoutSlash.slice(lastSpaceBeforeColon).trim();
      }
    }
    
    const commandName = commandPart;
    const options = {};
    
    if (optionsPart) {
      // Match option:value pairs, where value can be anything until the next option: or end
      const optionRegex = /(\w+):([^\s](?:[^]*?(?=\s+\w+:|$)))/g;
      let match;
      
      while ((match = optionRegex.exec(optionsPart)) !== null) {
        const optionName = match[1];
        let value = match[2];
        
        // Trim trailing whitespace
        value = value.trimEnd();
        
        options[optionName] = value;
      }
    }
    
    return { commandName, options };
  }

  function getCurrentOptionContext(text, cursorPosition) {
    // Determine which option the cursor is in
    if (!text || !text.startsWith('/') || !composerState.slashSelectedCommand) return null;
    
    // Find all option:value pairs in the text
    const optionRegex = /(\w+):([^\s](?:[^]*?(?=\s+\w+:|$)))/g;
    const optionMatches = [...text.matchAll(optionRegex)];
    
    if (optionMatches.length === 0) {
      // Check if cursor is right after a colon (just started typing an option)
      const beforeCursor = text.slice(0, cursorPosition);
      const colonMatch = beforeCursor.match(/(\w+):$/);
      if (colonMatch) {
        const optionName = colonMatch[1];
        const option = composerState.slashSelectedCommand.options?.find(opt => opt.name === optionName);
        if (option) {
          return {
            option,
            optionName,
            currentValue: '',
            startPos: cursorPosition,
            endPos: cursorPosition
          };
        }
      }
      return null;
    }
    
    // Find which option the cursor is in
    for (let i = 0; i < optionMatches.length; i++) {
      const match = optionMatches[i];
      const optionName = match[1];
      const matchStart = match.index;
      const startPos = matchStart + optionName.length + 1; // Position after ":"
      
      // Calculate end position
      const nextMatch = optionMatches[i + 1];
      let endPos;
      if (nextMatch) {
        // Find the start of next option name (backtrack from the match to find the space before it)
        const beforeNextMatch = text.slice(0, nextMatch.index).trimEnd();
        endPos = beforeNextMatch.length;
      } else {
        endPos = text.length;
      }
      
      // Check if cursor is within this option's value area
      if (cursorPosition >= startPos && cursorPosition <= endPos) {
        // Find this option in the command
        const option = composerState.slashSelectedCommand.options?.find(opt => opt.name === optionName);
        if (!option) continue;
        
        // Get the current value up to cursor
        const fullValue = text.slice(startPos, endPos).trimEnd();
        const cursorInValue = cursorPosition - startPos;
        const currentValue = fullValue.slice(0, Math.max(0, cursorInValue));
        
        return {
          option,
          optionName,
          currentValue: currentValue,
          startPos,
          endPos: startPos + fullValue.length
        };
      }
    }
    
    return null;
  }

  function hideInlineChoicesMenu() {
    if (composerState.inlineChoicesMenu) {
      composerState.inlineChoicesMenu.hidden = true;
      composerState.inlineChoicesMenu.innerHTML = '';
    }
    composerState.currentOptionContext = null;
    
    // Clear autocomplete debounce timer
    if (composerState.autocompleteDebounceTimer) {
      clearTimeout(composerState.autocompleteDebounceTimer);
      composerState.autocompleteDebounceTimer = null;
    }
  }

  function showInlineOptionInput(option, buttonElement) {
    const parsed = parseInlineCommand(composerState.textarea.value);
    const currentValue = parsed?.options[option.name] || '';

    // Remove any existing inline input
    const existingInput = buttonElement.parentElement.querySelector('.breadcord-message-composer__option-input');
    if (existingInput) {
      existingInput.remove();
    }

    // Type 5 = BOOLEAN - show as buttons, no input
    if (option.type === 5) {
      const wrapper = document.createElement('div');
      wrapper.className = 'breadcord-message-composer__option-input';
      
      const trueBtn = document.createElement('button');
      trueBtn.type = 'button';
      trueBtn.className = 'breadcord-message-composer__option-choice';
      trueBtn.textContent = 'True';
      if (currentValue === 'true') trueBtn.classList.add('is-selected');
      trueBtn.addEventListener('click', () => {
        updateOptionValue(option.name, 'true');
        wrapper.remove();
      });
      
      const falseBtn = document.createElement('button');
      falseBtn.type = 'button';
      falseBtn.className = 'breadcord-message-composer__option-choice';
      falseBtn.textContent = 'False';
      if (currentValue === 'false') falseBtn.classList.add('is-selected');
      falseBtn.addEventListener('click', () => {
        updateOptionValue(option.name, 'false');
        wrapper.remove();
      });
      
      wrapper.appendChild(trueBtn);
      wrapper.appendChild(falseBtn);
      
      buttonElement.insertAdjacentElement('afterend', wrapper);
      return;
    }

    // Has predefined choices (not autocomplete) - show as buttons
    if (option.choices && option.choices.length > 0 && !option.autocomplete) {
      const wrapper = document.createElement('div');
      wrapper.className = 'breadcord-message-composer__option-input breadcord-message-composer__option-input--choices';
      
      option.choices.forEach(choice => {
        const choiceBtn = document.createElement('button');
        choiceBtn.type = 'button';
        choiceBtn.className = 'breadcord-message-composer__option-choice';
        choiceBtn.textContent = choice.name;
        if (currentValue === String(choice.value)) {
          choiceBtn.classList.add('is-selected');
        }
        choiceBtn.addEventListener('click', () => {
          updateOptionValue(option.name, String(choice.value));
          wrapper.remove();
        });
        wrapper.appendChild(choiceBtn);
      });
      
      buttonElement.insertAdjacentElement('afterend', wrapper);
      return;
    }

    // All other types - show text/number input
    const input = document.createElement('input');
    input.className = 'breadcord-message-composer__option-input';
    
    if (option.type === 4 || option.type === 10) {
      input.type = 'number';
    } else {
      input.type = 'text';
    }
    
    input.value = currentValue;
    input.placeholder = option.name;
    
    // Handle input changes
    input.addEventListener('input', (e) => {
      updateOptionValue(option.name, e.target.value);
      
      // If autocomplete option, trigger autocomplete
      if (option.autocomplete) {
        const text = composerState.textarea.value;
        const cursorPos = text.indexOf(`${option.name}:`) + option.name.length + 1 + e.target.value.length;
        composerState.textarea.setSelectionRange(cursorPos, cursorPos);
        updateInlineChoicesMenu();
      }
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.remove();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.remove();
      }
    });
    
    input.addEventListener('blur', () => {
      // Small delay to allow clicking choices
      setTimeout(() => {
        if (document.activeElement !== input) {
          input.remove();
        }
      }, 150);
    });
    
    buttonElement.insertAdjacentElement('afterend', input);
    setTimeout(() => input.focus(), 0);
  }

  function updateOptionValue(optionName, value) {
    if (!composerState.textarea) return;
    
    const text = composerState.textarea.value;
    const optionPattern = new RegExp(`(\\s${optionName}:)([^\\s]*)`, 'g');
    const matches = [...text.matchAll(optionPattern)];
    
    if (matches.length > 0) {
      // Replace existing value
      const match = matches[matches.length - 1];
      const before = text.slice(0, match.index + match[1].length);
      const after = text.slice(match.index + match[0].length);
      composerState.textarea.value = before + value + after;
    } else {
      // Add new option
      composerState.textarea.value = `${text} ${optionName}:${value}`;
    }
    
    composerState.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    // Don't re-render helper - it would lose focus on inputs
  }

  function showMemberListForInput(searchValue, inputElement) {
    if (!composerState.inlineChoicesMenu) return;
    
    // Get current guild ID
    const guildId = getCurrentGuildId();
    if (!guildId) {
      hideInlineChoicesMenu();
      return;
    }
    
    // Try to get cached members from BreadCache
    let members = [];
    try {
      if (typeof BreadCache?.getGuild === 'function') {
        const guild = BreadCache.getGuild(guildId);
        console.log('Guild:', guild);
        console.log('Guild members:', guild?.members);
        if (guild && guild.members) {
          // Members can be stored as an array or object/Map
          if (Array.isArray(guild.members)) {
            members = guild.members;
          } else if (guild.members instanceof Map) {
            members = Array.from(guild.members.values());
          } else if (typeof guild.members === 'object') {
            members = Object.values(guild.members);
          }
          console.log('Fetched members:', members.length);
        }
      }
    } catch (e) {
      console.warn('Could not fetch guild members:', e);
    }
    
    if (members.length === 0) {
      // Show message that user can enter ID
      composerState.inlineChoicesMenu.innerHTML = '';
      composerState.inlineChoicesMenu.hidden = false;
      
      const hint = document.createElement('div');
      hint.className = 'breadcord-message-composer__inline-choice-hint';
      hint.textContent = 'Enter a user ID or @mention (no members cached)';
      composerState.inlineChoicesMenu.appendChild(hint);
      return;
    }
    
    // Filter members based on search value
    const search = (searchValue || '').toLowerCase();
    let filteredMembers;
    
    if (search) {
      // Filter by search term
      filteredMembers = members.filter(member => {
        const user = member.user;
        if (!user) return false;
        
        const username = (user.username || '').toLowerCase();
        const globalName = (user.global_name || '').toLowerCase();
        const id = user.id || '';
        
        return username.includes(search) || 
               globalName.includes(search) || 
               id.includes(search);
      }).slice(0, 50); // Limit to 50 members
    } else {
      // Show first 50 members when no search
      filteredMembers = members.slice(0, 50);
    }
    
    if (filteredMembers.length === 0 && search) {
      // Show hint that they can enter ID
      composerState.inlineChoicesMenu.innerHTML = '';
      composerState.inlineChoicesMenu.hidden = false;
      
      const hint = document.createElement('div');
      hint.className = 'breadcord-message-composer__inline-choice-hint';
      hint.textContent = 'No members found. You can enter a user ID or @mention';
      composerState.inlineChoicesMenu.appendChild(hint);
      return;
    }
    
    // Show the inline choices menu with members
    composerState.inlineChoicesMenu.innerHTML = '';
    composerState.inlineChoicesMenu.hidden = false;
    
    filteredMembers.forEach(member => {
      const user = member.user;
      if (!user) return;
      
      const choiceEl = document.createElement('button');
      choiceEl.type = 'button';
      choiceEl.className = 'breadcord-message-composer__inline-choice breadcord-message-composer__member-choice';
      
      // Add avatar
      const avatar = document.createElement('img');
      avatar.className = 'breadcord-message-composer__member-avatar';
      const avatarHash = user.avatar;
      if (avatarHash) {
        const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
        avatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${avatarHash}.${extension}?size=32`;
      } else {
        // Default avatar
        const defaultAvatarIndex = user.discriminator ? parseInt(user.discriminator) % 5 : (parseInt(user.id) >> 22) % 6;
        avatar.src = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
      }
      avatar.alt = '';
      choiceEl.appendChild(avatar);
      
      // Add text container
      const textContainer = document.createElement('div');
      textContainer.className = 'breadcord-message-composer__member-text';
      
      const choiceName = document.createElement('div');
      choiceName.className = 'breadcord-message-composer__inline-choice-name';
      choiceName.textContent = user.global_name || user.username || 'Unknown User';
      textContainer.appendChild(choiceName);
      
      const choiceDesc = document.createElement('div');
      choiceDesc.className = 'breadcord-message-composer__inline-choice-desc';
      choiceDesc.textContent = `@${user.username || 'unknown'}`;
      textContainer.appendChild(choiceDesc);
      
      choiceEl.appendChild(textContainer);
      
      choiceEl.addEventListener('click', () => {
        updateOptionValue(inputElement.dataset.optionName, user.id);
        
        // Update the input element's value directly
        inputElement.value = user.id;
        
        // Trigger resize if needed
        if (inputElement.updateSize) {
          inputElement.updateSize();
        }
        
        hideInlineChoicesMenu();
        
        // Focus next input
        const optionWrapper = inputElement.closest('.breadcord-message-composer__option-wrapper');
        if (optionWrapper) {
          const nextWrapper = optionWrapper.nextElementSibling;
          if (nextWrapper) {
            const nextInput = nextWrapper.querySelector('.breadcord-message-composer__option-input');
            if (nextInput) {
              setTimeout(() => nextInput.focus(), 0);
            }
          }
        }
      });
      
      composerState.inlineChoicesMenu.appendChild(choiceEl);
    });
  }

  function showInlineChoicesForOption(option, searchValue, inputElement) {
    if (!composerState.inlineChoicesMenu) return;
    
    // Filter choices based on search value
    const search = (searchValue || '').toLowerCase();
    const filteredChoices = option.choices.filter(choice => 
      choice.name.toLowerCase().includes(search) || 
      String(choice.value).toLowerCase().includes(search)
    );
    
    if (filteredChoices.length === 0) {
      hideInlineChoicesMenu();
      return;
    }
    
    // Show the inline choices menu
    composerState.inlineChoicesMenu.innerHTML = '';
    composerState.inlineChoicesMenu.hidden = false;
    
    filteredChoices.forEach(choice => {
      const choiceEl = document.createElement('button');
      choiceEl.type = 'button';
      choiceEl.className = 'breadcord-message-composer__inline-choice';
      
      const choiceName = document.createElement('div');
      choiceName.className = 'breadcord-message-composer__inline-choice-name';
      choiceName.textContent = choice.name;
      choiceEl.appendChild(choiceName);
      
      choiceEl.addEventListener('click', () => {
        updateOptionValue(option.name, String(choice.value));
        
        // Update the input element's value directly
        inputElement.value = String(choice.value);
        
        // Trigger resize if needed
        if (inputElement.updateSize) {
          inputElement.updateSize();
        }
        
        hideInlineChoicesMenu();
        // Focus next input
        const optionWrapper = inputElement.closest('.breadcord-message-composer__option-wrapper');
        if (optionWrapper) {
          const nextWrapper = optionWrapper.nextElementSibling;
          if (nextWrapper) {
            const nextInput = nextWrapper.querySelector('.breadcord-message-composer__option-input');
            if (nextInput) {
              setTimeout(() => nextInput.focus(), 0);
            }
          }
        }
      });
      
      composerState.inlineChoicesMenu.appendChild(choiceEl);
    });
  }

  function renderCommandHelper() {
    if (!composerState.textarea || !composerState.slashSelectedCommand) {
      hideCommandHelper();
      return;
    }

    const text = composerState.textarea.value;
    const command = composerState.slashSelectedCommand;
    
    if (!text.startsWith('/')) {
      hideCommandHelper();
      return;
    }

    // Get or create the helper element
    let helper = document.querySelector('.breadcord-message-composer__command-helper');
    if (!helper) {
      helper = document.createElement('div');
      helper.className = 'breadcord-message-composer__command-helper';
      // Insert helper right before the input-shell to replace it
      const inputShell = composerState.textarea.closest('.breadcord-message-composer__input-shell');
      if (inputShell && inputShell.parentElement) {
        inputShell.parentElement.insertBefore(helper, inputShell);
      }
    }

    // Hide input-shell and show helper in its place
    const inputShell = composerState.textarea.closest('.breadcord-message-composer__input-shell');
    if (inputShell) {
      inputShell.style.display = 'none';
    }
    helper.style.display = 'flex';

    helper.innerHTML = '';
    
    // Add bot icon if available
    if (command.application_id) {
      const botIcon = document.createElement('img');
      botIcon.className = 'breadcord-message-composer__command-bot-icon';
      
      let botAvatarHash = null;
      let botId = command.application_id;
      
      // Get application metadata from command
      const appMeta = command.__breadcordApplication || command.application;
      
      if (appMeta) {
        botAvatarHash = appMeta.icon;
        botId = appMeta.id || botId;
      }
      
      if (botAvatarHash) {
        const extension = botAvatarHash.startsWith('a_') ? 'gif' : 'png';
        botIcon.src = `https://cdn.discordapp.com/app-icons/${botId}/${botAvatarHash}.${extension}?size=32`;
      } else {
        // Default bot icon - use blurple Discord logo
        botIcon.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
      }
      
      botIcon.alt = '';
      botIcon.onerror = () => {
        // Fallback if icon fails to load
        botIcon.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
      };
      helper.appendChild(botIcon);
    }
    
    // Add command name button
    const commandButton = document.createElement('button');
    commandButton.type = 'button';
    commandButton.className = 'breadcord-message-composer__command-part';
    commandButton.dataset.type = 'command';
    
    // Display the actual command name used
    let displayName = command.name;
    if (command._isSubcommand) {
      if (command._subcommandGroup) {
        displayName = `${command._parentCommand} ${command._subcommandGroup} ${command._subcommandName}`;
      } else {
        displayName = `${command._parentCommand} ${command._subcommandName}`;
      }
    }
    commandButton.textContent = `/${displayName}`;
    
    commandButton.addEventListener('click', () => {
      // Find the command name in the text
      const commandMatch = text.match(/^\/[^\s:]+(?:\s+[^\s:]+)*/);
      if (commandMatch) {
        composerState.textarea.focus();
        composerState.textarea.setSelectionRange(0, commandMatch[0].length);
      }
    });
    helper.appendChild(commandButton);

    // Get options for this command (handle subcommands)
    let options = command.options || [];
    if (command._isSubcommand && command._actualOptions) {
      options = command._actualOptions;
    }

    // Get current values
    const parsed = parseInlineCommand(text);
    const currentValues = parsed?.options || {};

    // Add option buttons with inputs
    options.forEach(option => {
      const currentValue = currentValues[option.name] || '';
      
      // Create wrapper for option button + input
      const optionWrapper = document.createElement('div');
      optionWrapper.className = 'breadcord-message-composer__option-wrapper';
      
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'breadcord-message-composer__command-part breadcord-message-composer__option-name';
      optionButton.dataset.type = 'option';
      optionButton.dataset.optionName = option.name;
      
      if (option.required) {
        optionButton.classList.add('breadcord-message-composer__command-part--required');
      }
      
      optionButton.textContent = option.name;
      optionWrapper.appendChild(optionButton);
      
      // Type 5 = BOOLEAN - show as toggle buttons
      if (option.type === 5) {
        const trueBtn = document.createElement('button');
        trueBtn.type = 'button';
        trueBtn.className = 'breadcord-message-composer__option-choice';
        trueBtn.textContent = 'True';
        if (currentValue === 'true') trueBtn.classList.add('is-selected');
        trueBtn.addEventListener('click', () => {
          updateOptionValue(option.name, 'true');
        });
        
        const falseBtn = document.createElement('button');
        falseBtn.type = 'button';
        falseBtn.className = 'breadcord-message-composer__option-choice';
        falseBtn.textContent = 'False';
        if (currentValue === 'false') falseBtn.classList.add('is-selected');
        falseBtn.addEventListener('click', () => {
          updateOptionValue(option.name, 'false');
        });
        
        optionWrapper.appendChild(trueBtn);
        optionWrapper.appendChild(falseBtn);
        
        // Make clicking the option name focus the first button
        optionButton.addEventListener('click', () => {
          trueBtn.focus();
        });
      }
      // All other types (including choices) - show auto-sizing text/number input
      else {
        const input = document.createElement('input');
        input.className = 'breadcord-message-composer__option-input';
        input.dataset.optionName = option.name;
        
        if (option.type === 4 || option.type === 10) {
          input.type = 'number';
        } else {
          input.type = 'text';
        }
        
        input.value = currentValue;
        
        // Store option reference for showing choices
        input._option = option;
        
        // Auto-size based on content
        
        // Auto-size based on content
        const updateInputSize = () => {
          const minWidth = 40;
          const testSpan = document.createElement('span');
          testSpan.style.visibility = 'hidden';
          testSpan.style.position = 'absolute';
          testSpan.style.whiteSpace = 'pre';
          testSpan.style.font = window.getComputedStyle(input).font;
          testSpan.textContent = input.value || 'a';
          document.body.appendChild(testSpan);
          // Add extra padding to account for input padding (20px total: 10px left + 10px right)
          const width = Math.max(minWidth, testSpan.offsetWidth + 24);
          testSpan.remove();
          input.style.width = width + 'px';
        };
        
        // Store the update function on the input for external access
        input.updateSize = updateInputSize;
        
        updateInputSize();
        
        // Handle input changes
        input.addEventListener('input', (e) => {
          updateInputSize();
          updateOptionValue(option.name, e.target.value);
          
          // Type 6 = USER - show member list
          if (option.type === 6) {
            showMemberListForInput(e.target.value, input);
          }
          // Show choices in inline menu for options with predefined choices
          else if (option.choices && option.choices.length > 0) {
            showInlineChoicesForOption(option, e.target.value, input);
          }
          // If autocomplete option, trigger autocomplete
          else if (option.autocomplete) {
            const text = composerState.textarea.value;
            const cursorPos = text.indexOf(`${option.name}:`) + option.name.length + 1 + e.target.value.length;
            composerState.textarea.setSelectionRange(cursorPos, cursorPos);
            updateInlineChoicesMenu();
          } else {
            // No choices or autocomplete, hide the menu
            hideInlineChoicesMenu();
          }
        });
        
        input.addEventListener('focus', (e) => {
          // Use setTimeout to ensure this runs after blur events from other inputs
          setTimeout(() => {
            // Type 6 = USER - show member list
            if (option.type === 6) {
              showMemberListForInput(e.target.value, input);
            }
            // Show all choices when focusing an input with predefined choices
            else if (option.choices && option.choices.length > 0) {
              showInlineChoicesForOption(option, e.target.value, input);
            } else if (option.autocomplete) {
              // Trigger autocomplete for autocomplete options
              const text = composerState.textarea.value;
              const cursorPos = text.indexOf(`${option.name}:`) + option.name.length + 1 + e.target.value.length;
              composerState.textarea.setSelectionRange(cursorPos, cursorPos);
              updateInlineChoicesMenu();
            }
          }, 0);
        });
        
        input.addEventListener('blur', () => {
          // Hide choices when input loses focus (with small delay for clicking)
          setTimeout(() => {
            const activeEl = document.activeElement;
            // Don't hide if focusing on the choices menu
            if (activeEl?.closest('.breadcord-message-composer__inline-choices')) {
              return;
            }
            // Don't hide if focusing on another input that will show choices
            const activeInput = activeEl?.closest('.breadcord-message-composer__option-input');
            if (activeInput && activeInput._option) {
              const activeOption = activeInput._option;
              // Don't hide if the new input has choices, autocomplete, or is a user select
              if (activeOption.choices?.length > 0 || activeOption.autocomplete || activeOption.type === 6) {
                return; // New input will handle showing its own choices/members
              }
            }
            // Otherwise hide the menu
            hideInlineChoicesMenu();
          }, 150);
        });
        
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            // If inline choices menu is visible, select the first option
            if (composerState.inlineChoicesMenu && !composerState.inlineChoicesMenu.hidden) {
              e.preventDefault();
              const firstChoice = composerState.inlineChoicesMenu.querySelector('.breadcord-message-composer__inline-choice');
              if (firstChoice) {
                firstChoice.click();
                return;
              }
            }
            // Otherwise, move to next input or submit
            e.preventDefault();
            hideInlineChoicesMenu();
            const nextWrapper = optionWrapper.nextElementSibling;
            if (nextWrapper) {
              const nextInput = nextWrapper.querySelector('.breadcord-message-composer__option-input');
              if (nextInput) {
                nextInput.focus();
              }
            } else {
              // Submit the command
              const sendBtn = helper.querySelector('.breadcord-message-composer__command-send');
              if (sendBtn) sendBtn.click();
            }
          } else if (e.key === 'Tab') {
            e.preventDefault();
            hideInlineChoicesMenu();
            // Focus next input or send button
            const nextWrapper = optionWrapper.nextElementSibling;
            if (nextWrapper) {
              const nextInput = nextWrapper.querySelector('.breadcord-message-composer__option-input');
              if (nextInput) {
                nextInput.focus();
              }
            } else {
              // Focus send button
              const sendBtn = helper.querySelector('.breadcord-message-composer__command-send');
              if (sendBtn) sendBtn.focus();
            }
          } else if (e.key === 'ArrowLeft') {
            // If cursor is at the start of input, jump to previous input
            if (input.selectionStart === 0 && input.selectionEnd === 0) {
              e.preventDefault();
              const prevWrapper = optionWrapper.previousElementSibling;
              if (prevWrapper) {
                const prevInput = prevWrapper.querySelector('.breadcord-message-composer__option-input');
                if (prevInput && (prevInput instanceof HTMLInputElement)) {
                  prevInput.focus();
                  // Move cursor to end of previous input
                  prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
                }
              }
            }
          } else if (e.key === 'ArrowRight') {
            // If cursor is at the end of input, jump to next input
            if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
              e.preventDefault();
              const nextWrapper = optionWrapper.nextElementSibling;
              if (nextWrapper) {
                const nextInput = nextWrapper.querySelector('.breadcord-message-composer__option-input');
                if (nextInput && (nextInput instanceof HTMLInputElement)) {
                  nextInput.focus();
                  // Move cursor to start of next input
                  nextInput.setSelectionRange(0, 0);
                }
              }
            }
          } else if (e.key === 'Backspace' || e.key === 'Delete') {
            // If input is empty and at start, cancel the command
            if (input.value === '' && input.selectionStart === 0) {
              // Check if this is the first input
              const allInputs = Array.from(helper.querySelectorAll('.breadcord-message-composer__option-input[type="text"], .breadcord-message-composer__option-input[type="number"]'));
              const isFirstInput = allInputs[0] === input;
              
              if (isFirstInput) {
                e.preventDefault();
                // Cancel the command
                clearSlashCommandSelection();
                hideCommandHelper();
                composerState.textarea.value = '';
                composerState.textarea.focus();
              }
            }
          } else if (e.key === 'Escape') {
            hideInlineChoicesMenu();
          }
        });
        
        optionWrapper.appendChild(input);
        
        // Make clicking the option name focus the input
        optionButton.addEventListener('click', () => {
          input.focus();
        });
      }
      
      helper.appendChild(optionWrapper);
    });

    // Add send button
    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.className = 'breadcord-message-composer__command-send';
    sendButton.textContent = 'Run';
    sendButton.addEventListener('click', (e) => {
      e.preventDefault();
      submitSlashCommand();
    });
    helper.appendChild(sendButton);

    helper.removeAttribute('hidden');
  }

  function hideCommandHelper() {
    const helper = document.querySelector('.breadcord-message-composer__command-helper');
    if (helper) {
      helper.style.display = 'none';
    }
    // Show input-shell again
    if (composerState.textarea) {
      const inputShell = composerState.textarea.closest('.breadcord-message-composer__input-shell');
      if (inputShell) {
        inputShell.style.display = '';
      }
    }
  }

  function updateCommandHelperActiveState(context) {
    const helper = document.querySelector('.breadcord-message-composer__command-helper');
    if (!helper) return;

    // Remove all active states
    helper.querySelectorAll('.breadcord-message-composer__command-part').forEach(part => {
      part.classList.remove('breadcord-message-composer__command-part--active');
    });

    if (!context) return;

    // Highlight the active part
    if (context.inCommand) {
      // User is editing the command name
      const commandPart = helper.querySelector('[data-type="command"]');
      if (commandPart) {
        commandPart.classList.add('breadcord-message-composer__command-part--active');
      }
    } else if (context.option) {
      // User is editing an option value
      const optionPart = helper.querySelector(`[data-option-name="${context.option.name}"]`);
      if (optionPart) {
        optionPart.classList.add('breadcord-message-composer__command-part--active');
      }
    }
  }


  async function fetchAutocompleteChoices(command, optionName, currentValue, allOptions) {
    if (!gatewaySessionId) {
      console.warn('[breadcord_messagecomposer] No session ID for autocomplete');
      return;
    }

    const channelId = getCurrentChannelId();
    const guildId = getCurrentGuildId();
    
    if (!channelId || !guildId) {
      return;
    }

    if (typeof BreadAPI?.rest?.request !== 'function') {
      return;
    }

    // Build options array with focused flag
    const regularOptions = [];
    if (Array.isArray(command.options)) {
      for (const option of command.options) {
        if (option.type === 1 || option.type === 2) continue; // Skip subcommands
        
        const isFocused = option.name === optionName;
        const value = isFocused ? currentValue : (allOptions[option.name] || '');
        
        // Only include options that have values or are focused
        if (value !== '' || isFocused) {
          regularOptions.push({
            type: option.type,
            name: option.name,
            value: value,
            focused: isFocused,
          });
        }
      }
    }

    // Wrap in subcommand structure if needed
    let optionsPayload;
    let commandName = command._parentCommand || command.name;
    
    if (command._isSubcommand) {
      if (command._subcommandGroup) {
        // Subcommand group: /command group subcommand
        optionsPayload = [{
          type: 2,
          name: command._subcommandGroup,
          options: [{
            type: 1,
            name: command._subcommandName,
            options: regularOptions,
          }]
        }];
      } else {
        // Regular subcommand: /command subcommand
        optionsPayload = [{
          type: 1,
          name: command._subcommandName,
          options: regularOptions,
        }];
      }
    } else {
      // Regular command
      optionsPayload = regularOptions;
    }

    const nonce = generateNonce();
    const payload = {
      type: 4, // APPLICATION_COMMAND_AUTOCOMPLETE
      application_id: command.application_id,
      guild_id: guildId,
      channel_id: channelId,
      session_id: gatewaySessionId,
      data: {
        version: command.version,
        id: command.id,
        name: commandName,
        type: command.type,
        options: optionsPayload,
        application_command: cloneApplicationCommand(command),
      },
      nonce: nonce,
    };

    // Store the nonce so we can match the response
    composerState.pendingAutocompleteNonce = nonce;

    try {
      // Send the autocomplete request - response will come via gateway
      await BreadAPI.rest.request({
        method: 'POST',
        path: '/interactions',
        body: payload,
      });
    } catch (err) {
      console.error('[breadcord_messagecomposer] Autocomplete request failed:', err);
      composerState.pendingAutocompleteNonce = null;
      hideInlineChoicesMenu();
    }
  }

  function showInlineChoicesMenu(choices, context) {
    if (!composerState.inlineChoicesMenu || !choices || choices.length === 0) {
      hideInlineChoicesMenu();
      return;
    }
    
    composerState.currentOptionContext = context;
    composerState.inlineChoicesMenu.innerHTML = '';
    
    for (const choice of choices) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `${COMPOSER_CLASS}__inline-choice`;
      item.textContent = choice.name;
      
      item.addEventListener('click', () => {
        if (!composerState.textarea || !composerState.currentOptionContext) return;
        
        const text = composerState.textarea.value;
        const { startPos, endPos } = composerState.currentOptionContext;
        const choiceValue = String(choice.value != null ? choice.value : choice.name);
        
        // Replace the current value with the selected choice
        const newText = text.slice(0, startPos) + choiceValue + ' ' + text.slice(endPos);
        composerState.textarea.value = newText;
        
        // Move cursor to after the inserted value
        const newCursorPos = startPos + choiceValue.length + 1;
        composerState.textarea.setSelectionRange(newCursorPos, newCursorPos);
        composerState.textarea.focus();
        
        // Update form state
        if (composerState.slashFormState) {
          const key = getOptionKey([context.optionName]);
          composerState.slashFormState.values[key] = choiceValue;
        }
        
        hideInlineChoicesMenu();
        updateInlineChoicesMenu();
      });
      
      composerState.inlineChoicesMenu.appendChild(item);
    }
    
    composerState.inlineChoicesMenu.hidden = false;
  }

  function showInlineChoicesLoading(context) {
    if (!composerState.inlineChoicesMenu) return;
    
    composerState.currentOptionContext = context;
    composerState.inlineChoicesMenu.innerHTML = '';
    
    const loading = document.createElement('div');
    loading.className = `${COMPOSER_CLASS}__inline-loading`;
    loading.textContent = 'Loading suggestions...';
    
    composerState.inlineChoicesMenu.appendChild(loading);
    composerState.inlineChoicesMenu.hidden = false;
  }

  function updateInlineChoicesMenu() {
    if (!composerState.textarea || !composerState.slashSelectedCommand) {
      hideInlineChoicesMenu();
      return;
    }
    
    const text = composerState.textarea.value;
    const cursorPos = composerState.textarea.selectionStart;
    
    const context = getCurrentOptionContext(text, cursorPos);
    
    // Update command helper to show which field is active
    updateCommandHelperActiveState(context);
    
    if (!context || !context.option) {
      hideInlineChoicesMenu();
      return;
    }
    
    // Check if this option has autocomplete enabled
    if (context.option.autocomplete === true) {
      // Show loading state immediately
      showInlineChoicesLoading(context);
      
      // Clear any existing debounce timer
      if (composerState.autocompleteDebounceTimer) {
        clearTimeout(composerState.autocompleteDebounceTimer);
      }
      
      // Debounce autocomplete requests
      composerState.autocompleteDebounceTimer = setTimeout(() => {
        // Parse all current option values
        const parsed = parseInlineCommand(text);
        const allOptions = parsed ? parsed.options : {};
        
        // Send autocomplete request (response will come via gateway)
        fetchAutocompleteChoices(
          composerState.slashSelectedCommand,
          context.optionName,
          context.currentValue,
          allOptions
        );
      }, 300); // 300ms debounce
      
      return;
    }
    
    // Check if this option has predefined choices
    if (context.option.choices && Array.isArray(context.option.choices) && context.option.choices.length > 0) {
      // Filter choices based on current value
      let filteredChoices = context.option.choices;
      if (context.currentValue) {
        const query = context.currentValue.toLowerCase();
        filteredChoices = context.option.choices.filter(choice => 
          choice.name.toLowerCase().includes(query) || 
          String(choice.value).toLowerCase().includes(query)
        );
      }
      showInlineChoicesMenu(filteredChoices, context);
    } else if (context.option.type === 5) {
      // Boolean option
      const boolChoices = [
        { name: 'Yes', value: 'true' },
        { name: 'No', value: 'false' }
      ];
      showInlineChoicesMenu(boolChoices, context);
    } else {
      hideInlineChoicesMenu();
    }
  }

  function ensureSlashFormState(command) {
    if (!command) return null;
    const baseState = {
      command,
      values: {},
      errors: {},
    };
    composerState.slashFormState = baseState;
    return baseState;
  }

  function getOptionKey(pathSegments = []) {
    return pathSegments.join('::');
  }

  function coerceOptionValue(option, rawValue) {
    if (rawValue == null) return null;
    switch (option.type) {
      case 3: { // STRING
        if (rawValue === '') return '';
        const stringValue = String(rawValue);
        if (option.min_length != null && stringValue.length < option.min_length) {
          throw new Error(`${option.name} must be at least ${option.min_length} characters.`);
        }
        if (option.max_length != null && stringValue.length > option.max_length) {
          throw new Error(`${option.name} must be at most ${option.max_length} characters.`);
        }
        return stringValue;
      }
      case 4:
      case 10: {
        if (rawValue === '') return null;
        const numeric = option.type === 4 ? parseInt(rawValue, 10) : parseFloat(rawValue);
        if (!Number.isFinite(numeric)) {
          throw new Error(`Invalid number for ${option.name}`);
        }
        if (option.min_value != null && numeric < option.min_value) {
          throw new Error(`${option.name} must be ≥ ${option.min_value}`);
        }
        if (option.max_value != null && numeric > option.max_value) {
          throw new Error(`${option.name} must be ≤ ${option.max_value}`);
        }
        return numeric;
      }
      case 5:
        return Boolean(rawValue);
      case 6:
      case 7:
      case 8:
      case 9:
      case 11:
        return String(rawValue);
      default:
        return rawValue;
    }
  }

  function createOptionInput(option, pathSegments, formState) {
    const key = getOptionKey(pathSegments.concat(option.name));
    const wrapper = document.createElement('label');
    wrapper.className = `${COMPOSER_CLASS}__slash-inline-field`;
    if (option.description) {
      wrapper.title = option.description;
    }

    const nameEl = document.createElement('span');
    nameEl.className = `${COMPOSER_CLASS}__slash-inline-name`;
    nameEl.textContent = `${option.name}${option.required ? '*' : ''}:`;
    wrapper.appendChild(nameEl);

    const leftBracket = document.createElement('span');
    leftBracket.className = `${COMPOSER_CLASS}__slash-inline-bracket`;
    leftBracket.textContent = '[';
    wrapper.appendChild(leftBracket);

    let inputEl;
    const existingValue = formState.values[key];

    if (Array.isArray(option.choices) && option.choices.length) {
      const select = document.createElement('select');
      select.className = `${COMPOSER_CLASS}__slash-input`;
      if (!option.required) {
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Select…';
        select.appendChild(blank);
      }
      for (const choice of option.choices) {
        const opt = document.createElement('option');
        opt.value = choice.value != null ? String(choice.value) : choice.name;
        opt.textContent = choice.name;
        select.appendChild(opt);
      }
      if (existingValue != null && existingValue !== '') {
        select.value = String(existingValue);
      } else if (option.required && select.options.length > 0) {
        select.selectedIndex = 0;
      }
      inputEl = select;
    } else if (option.type === 5) {
      const select = document.createElement('select');
      select.className = `${COMPOSER_CLASS}__slash-input`;

      const blankOption = document.createElement('option');
      blankOption.value = '';
      blankOption.textContent = 'Select…';
      select.appendChild(blankOption);

      const trueOption = document.createElement('option');
      trueOption.value = 'true';
      trueOption.textContent = 'Yes';

      const falseOption = document.createElement('option');
      falseOption.value = 'false';
      falseOption.textContent = 'No';

      select.appendChild(trueOption);
      select.appendChild(falseOption);

      if (existingValue === true) {
        select.value = 'true';
      } else if (existingValue === false) {
        select.value = 'false';
      } else {
        select.value = '';
      }

      inputEl = select;
    } else {
      const input = document.createElement('input');
      input.className = `${COMPOSER_CLASS}__slash-input`;
      input.type = option.type === 4 || option.type === 10 ? 'number' : 'text';
      if (option.placeholder) {
        input.placeholder = option.placeholder;
      } else if (option.description) {
        input.placeholder = option.description;
      }
      if (option.min_length != null) input.minLength = option.min_length;
      if (option.max_length != null) input.maxLength = option.max_length;
      if (existingValue != null && existingValue !== undefined) {
        input.value = String(existingValue);
      }
      inputEl = input;
    }

    inputEl.dataset.optionKey = key;

    if (!(key in formState.values)) {
      if (option.type === 5) {
        formState.values[key] = inputEl.value === '' ? '' : inputEl.value === 'true';
      } else if (inputEl.tagName === 'SELECT') {
        formState.values[key] = inputEl.value;
      } else {
        formState.values[key] = inputEl.value || '';
      }
    }

    const updateValue = () => {
      if (option.type === 5) {
        formState.values[key] = inputEl.value === '' ? '' : inputEl.value === 'true';
      } else if (inputEl.tagName === 'SELECT') {
        formState.values[key] = inputEl.value;
      } else {
        formState.values[key] = inputEl.value;
      }
    };

    inputEl.addEventListener('input', updateValue);
    inputEl.addEventListener('change', updateValue);

    wrapper.appendChild(inputEl);

    const rightBracket = document.createElement('span');
    rightBracket.className = `${COMPOSER_CLASS}__slash-inline-bracket`;
    rightBracket.textContent = ']';
    wrapper.appendChild(rightBracket);

    return wrapper;
  }

  function renderSlashCommandForm(command) {
    if (!composerState.slashFormContainer) return;
    const formState = ensureSlashFormState(command);
    const container = composerState.slashFormContainer;
    container.innerHTML = '';
    if (!command) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    const prefix = document.createElement('span');
    prefix.className = `${COMPOSER_CLASS}__slash-inline-command`;
    prefix.textContent = `/${command.name}`;
    container.appendChild(prefix);

    if (Array.isArray(command.options) && command.options.length) {
      for (const option of command.options) {
        if (option.type === 1 || option.type === 2) {
          const unsupported = document.createElement('span');
          unsupported.className = `${COMPOSER_CLASS}__slash-unsupported`;
          unsupported.textContent = `Subcommands (${option.name}) are not supported yet.`;
          container.appendChild(unsupported);
          continue;
        }
        container.appendChild(createOptionInput(option, [], formState));
      }
    }

    const hint = document.createElement('div');
    hint.className = `${COMPOSER_CLASS}__slash-hint`;
    hint.textContent = 'Press Enter to run the command';
    container.appendChild(hint);

    const focusable = container.querySelector('input, select');
    if (focusable && typeof focusable.focus === 'function') {
      focusable.focus();
    }
  }

  function validateAndCollectOptionValues(command) {
    const formState = composerState.slashFormState;
    if (!command || !formState) return [];
    if (Array.isArray(command.options) && command.options.some((option) => option.type === 1 || option.type === 2)) {
      throw new Error('This command uses subcommands, which are not supported yet.');
    }

    const collected = [];
    if (!Array.isArray(command.options)) return collected;

    for (const option of command.options) {
      if (option.type === 1 || option.type === 2) continue;
      const key = getOptionKey([option.name]);
      let rawValue = formState.values[key];
      if (option.type === 5 && rawValue === '') rawValue = null;
      if ((rawValue === undefined || rawValue === null || rawValue === '') && option.required) {
        throw new Error(`Missing value for ${option.name}`);
      }
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;
      const coerced = coerceOptionValue(option, rawValue);
      collected.push({
        type: option.type,
        name: option.name,
        value: coerced,
      });
    }

    return collected;
  }

  function cloneApplicationCommand(command) {
    if (!command) return null;
    const cloned = JSON.parse(JSON.stringify(command));
    if (cloned && cloned.__breadcordApplication) {
      delete cloned.__breadcordApplication;
    }
    return cloned;
  }

  function generateNonce() {
    const now = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return String(now * 1000 + random);
  }

  async function submitSlashCommand() {
    const command = composerState.slashSelectedCommand;
    if (!command) return false;

    const channelId = getCurrentChannelId();
    const guildId = getCurrentGuildId();
    if (!channelId || !guildId) {
      showError('Slash commands are only available in guild channels.');
      return true;
    }

    if (!gatewaySessionId) {
      showError('Still connecting to Discord. Please try again momentarily.');
      return true;
    }

    if (typeof BreadAPI?.rest?.request !== 'function') {
      showError('Slash commands are not available right now.');
      return true;
    }

    // Parse inline command from textarea
    let optionPayload;
    let commandName = command._parentCommand || command.name;
    
    try {
      const text = composerState.textarea ? composerState.textarea.value : '';
      const parsed = parseInlineCommand(text);
      
      if (!parsed || parsed.commandName !== command.name) {
        throw new Error('Command format is invalid.');
      }
      
      // Build options payload
      const regularOptions = [];
      if (Array.isArray(command.options)) {
        for (const option of command.options) {
          if (option.type === 1 || option.type === 2) continue; // Skip subcommands
          
          const rawValue = parsed.options[option.name];
          
          if ((rawValue === undefined || rawValue === null || rawValue === '') && option.required) {
            throw new Error(`Missing value for ${option.name}`);
          }
          
          if (rawValue === undefined || rawValue === null || rawValue === '') continue;
          
          const coerced = coerceOptionValue(option, rawValue);
          regularOptions.push({
            type: option.type,
            name: option.name,
            value: coerced,
          });
        }
      }
      
      // If this is a subcommand, wrap the options in subcommand structure
      if (command._isSubcommand) {
        if (command._subcommandGroup) {
          // Subcommand group: /command group subcommand
          optionPayload = [{
            type: 2,
            name: command._subcommandGroup,
            options: [{
              type: 1,
              name: command._subcommandName,
              options: regularOptions,
            }]
          }];
        } else {
          // Regular subcommand: /command subcommand
          optionPayload = [{
            type: 1,
            name: command._subcommandName,
            options: regularOptions,
          }];
        }
      } else {
        // Regular command
        optionPayload = regularOptions;
      }
    } catch (err) {
      showError(err?.message || 'Fill in the required fields for this command.');
      return true;
    }

    const payload = {
      type: 2,
      application_id: command.application_id,
      guild_id: guildId,
      channel_id: channelId,
      session_id: gatewaySessionId,
      data: {
        version: command.version,
        id: command.id,
        name: commandName,
        type: command.type,
        options: optionPayload,
        application_command: cloneApplicationCommand(command),
        attachments: [],
      },
      nonce: generateNonce(),
    };

    setSending(true);
    try {
      await BreadAPI.rest.request({
        method: 'POST',
        path: '/interactions',
        body: payload,
      });
      clearError();
      clearSlashCommandSelection();
      clearAttachments();
      if (composerState.textarea) {
        composerState.textarea.value = '';
        autoSizeTextarea(composerState.textarea);
      }
    } catch (err) {
      const message = err?.data?.message || err?.result?.error || err?.message || 'Failed to execute slash command.';
      showError(message);
    } finally {
      setSending(false);
    }

    return true;
  }

  function ensureActiveSlashTab(entry) {
    if (!entry || !Array.isArray(entry.groups) || entry.groups.length === 0) {
      composerState.slashActiveAppId = null;
      return;
    }
    if (composerState.slashActiveAppId && (composerState.slashActiveAppId === '__all__' || entry.groups.some((group) => group.applicationId === composerState.slashActiveAppId))) {
      return;
    }
    composerState.slashActiveAppId = '__all__';
  }

  function filterCommandsByQuery(commands, query) {
    if (!Array.isArray(commands)) return [];
    const normalized = typeof query === 'string' ? query.toLowerCase() : '';
    if (!normalized.length) return commands.slice();
    return commands.filter((command) => normalizeCommandName(command).toLowerCase().startsWith(normalized));
  }

  function expandCommandsWithSubcommands(commands) {
    // Expand commands that only have subcommands into individual commands
    if (!Array.isArray(commands)) return [];
    
    const expanded = [];
    
    for (const command of commands) {
      const options = Array.isArray(command.options) ? command.options : [];
      
      // Check if this command ONLY has subcommands/subcommand groups
      const hasOnlySubcommands = options.length > 0 && options.every(opt => opt.type === 1 || opt.type === 2);
      
      if (hasOnlySubcommands) {
        // Expand each subcommand as a separate entry
        for (const subcommand of options) {
          if (subcommand.type === 1) {
            // Type 1 = Subcommand
            expanded.push({
              ...command,
              name: `${command.name} ${subcommand.name}`,
              description: subcommand.description || command.description,
              options: subcommand.options || [],
              _isSubcommand: true,
              _parentCommand: command.name,
              _subcommandName: subcommand.name,
            });
          } else if (subcommand.type === 2) {
            // Type 2 = Subcommand group - expand its subcommands too
            const groupOptions = Array.isArray(subcommand.options) ? subcommand.options : [];
            for (const groupSubcommand of groupOptions) {
              if (groupSubcommand.type === 1) {
                expanded.push({
                  ...command,
                  name: `${command.name} ${subcommand.name} ${groupSubcommand.name}`,
                  description: groupSubcommand.description || subcommand.description || command.description,
                  options: groupSubcommand.options || [],
                  _isSubcommand: true,
                  _parentCommand: command.name,
                  _subcommandGroup: subcommand.name,
                  _subcommandName: groupSubcommand.name,
                });
              }
            }
          }
        }
      } else {
        // Regular command or command with regular options
        expanded.push(command);
      }
    }
    
    return expanded;
  }

  function handleSlashCommandSelection(command) {
    if (!command) return;
    composerState.slashSelectedCommand = command;
    
    // Build inline command string
    if (composerState.textarea) {
      let commandStr = `/${command.name}`;
      
      if (Array.isArray(command.options) && command.options.length) {
        for (const option of command.options) {
          if (option.type === 1 || option.type === 2) continue; // Skip subcommands
          const optionName = option.name;
          commandStr += ` ${optionName}:`;
        }
      }
      
      composerState.textarea.value = commandStr;
      autoSizeTextarea(composerState.textarea);
      
      // Position cursor after first colon if exists
      const firstColonIndex = commandStr.indexOf(':');
      if (firstColonIndex !== -1) {
        composerState.textarea.setSelectionRange(firstColonIndex + 1, firstColonIndex + 1);
      }
      
      composerState.textarea.focus();
      
      // Render interactive command helper
      renderCommandHelper();
      
      // Focus the first option input if one exists
      setTimeout(() => {
        const helper = document.querySelector('.breadcord-message-composer__command-helper');
        if (helper) {
          const firstInput = helper.querySelector('.breadcord-message-composer__option-input[type="text"], .breadcord-message-composer__option-input[type="number"]');
          const firstChoice = helper.querySelector('.breadcord-message-composer__option-choice');
          if (firstInput) {
            firstInput.focus();
          } else if (firstChoice) {
            firstChoice.focus();
          }
        }
      }, 0);
    }
    
    hideSlashMenu();
    ensureSlashFormState(command);
    updateInlineChoicesMenu();
    clearError();
  }

  function oldRenderCommandHelper(command, commandStr) {
    if (!composerState.slashFormContainer) return;
    
    composerState.slashFormContainer.innerHTML = '';
    composerState.slashFormContainer.hidden = false;
    
    const helper = document.createElement('div');
    helper.className = `${COMPOSER_CLASS}__command-helper`;
    
    // Command name (clickable to go to start)
    const commandName = document.createElement('button');
    commandName.type = 'button';
    commandName.className = `${COMPOSER_CLASS}__command-part`;
    commandName.textContent = `/${command.name}`;
    commandName.title = 'Click to go to command name';
    commandName.addEventListener('click', () => {
      if (composerState.textarea) {
        composerState.textarea.focus();
        composerState.textarea.setSelectionRange(0, command.name.length + 1);
      }
    });
    helper.appendChild(commandName);
    
    // Options (clickable to jump to each field)
    if (Array.isArray(command.options)) {
      for (const option of command.options) {
        if (option.type === 1 || option.type === 2) continue; // Skip subcommands
        
        const optionBtn = document.createElement('button');
        optionBtn.type = 'button';
        optionBtn.className = `${COMPOSER_CLASS}__command-part`;
        if (option.required) {
          optionBtn.classList.add('is-required');
        }
        optionBtn.textContent = `${option.name}:`;
        optionBtn.title = option.description || `Click to fill ${option.name}`;
        
        optionBtn.addEventListener('click', () => {
          if (!composerState.textarea) return;
          const text = composerState.textarea.value;
          const optionPattern = new RegExp(`\\b${option.name}:(.*?)(?=\\s+\\w+:|$)`);
          const match = optionPattern.exec(text);
          if (match) {
            const startPos = match.index + option.name.length + 1;
            const endPos = startPos + match[1].length;
            composerState.textarea.focus();
            composerState.textarea.setSelectionRange(startPos, endPos);
            updateInlineChoicesMenu();
          }
        });
        
        helper.appendChild(optionBtn);
      }
    }
    
    const hint = document.createElement('div');
    hint.className = `${COMPOSER_CLASS}__command-hint`;
    hint.textContent = 'Click option names to jump to them • Press Enter to send';
    helper.appendChild(hint);
    
    composerState.slashFormContainer.appendChild(helper);
  }

  function renderSlashMenuFromData(entry) {
    if (!entry || !composerState.slashTabs || !composerState.slashCommandsContainer) {
      setSlashStatus('No slash commands available in this channel.');
      return;
    }

    const groups = Array.isArray(entry.groups) ? entry.groups : [];
    if (!groups.length) {
      composerState.slashTabs.innerHTML = '';
      composerState.slashCommandsContainer.innerHTML = '';
      setSlashStatus('No slash commands available in this channel.');
      return;
    }

    const query = (composerState.slashQuery || '').toLowerCase();
    
    // Handle "All" tab
    let activeGroup;
    let filteredCommands = [];
    
    if (composerState.slashActiveAppId === '__all__') {
      // Show all commands from all groups
      const allCommands = groups.flatMap(group => 
        expandCommandsWithSubcommands(group.commands).map(cmd => ({
          ...cmd,
          _groupName: group.applicationName,
          _groupId: group.applicationId
        }))
      );
      filteredCommands = filterCommandsByQuery(allCommands, query);
      activeGroup = { applicationId: '__all__', applicationName: 'All', commands: allCommands };
    } else {
      activeGroup = groups.find((group) => group.applicationId === composerState.slashActiveAppId) || groups[0];
      
      // Expand commands with subcommands
      const expandedCommands = expandCommandsWithSubcommands(activeGroup.commands);
      filteredCommands = filterCommandsByQuery(expandedCommands, query);

      if (!composerState.slashActiveAppId || composerState.slashActiveAppId !== activeGroup.applicationId) {
        composerState.slashActiveAppId = activeGroup.applicationId;
      }

      if (query && filteredCommands.length === 0) {
        const fallback = groups.find((group) => {
          const expanded = expandCommandsWithSubcommands(group.commands);
          return filterCommandsByQuery(expanded, query).length > 0;
        });
        if (fallback) {
          composerState.slashActiveAppId = fallback.applicationId;
          activeGroup = fallback;
          const expandedFallback = expandCommandsWithSubcommands(activeGroup.commands);
          filteredCommands = filterCommandsByQuery(expandedFallback, query);
        }
      }
    }

    composerState.slashTabs.innerHTML = '';
    
    // Add "All" tab
    const allTab = document.createElement('button');
    allTab.type = 'button';
    allTab.className = `${COMPOSER_CLASS}__slash-tab`;
    allTab.textContent = 'All';
    if (composerState.slashActiveAppId === '__all__') {
      allTab.classList.add('is-active');
    }
    allTab.addEventListener('click', () => {
      if (composerState.slashActiveAppId === '__all__') return;
      composerState.slashActiveAppId = '__all__';
      renderSlashMenuFromData(entry);
    });
    composerState.slashTabs.appendChild(allTab);
    
    // Add other tabs
    for (const group of groups) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `${COMPOSER_CLASS}__slash-tab`;
      tab.textContent = group.applicationName && group.applicationName.trim().length ? group.applicationName : `App ${group.applicationId}`;
      if (group.applicationId === composerState.slashActiveAppId) {
        tab.classList.add('is-active');
      }
      tab.addEventListener('click', () => {
        if (composerState.slashActiveAppId === group.applicationId) return;
        composerState.slashActiveAppId = group.applicationId;
        renderSlashMenuFromData(entry);
      });
      composerState.slashTabs.appendChild(tab);
    }

    composerState.slashCommandsContainer.innerHTML = '';

    if (!filteredCommands.length) {
      const message = query ? 'No commands match your input.' : 'No slash commands available for this bot.';
      setSlashStatus(message);
      return;
    }

    setSlashStatus('');
    for (const command of filteredCommands) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `${COMPOSER_CLASS}__slash-command`;
      item.addEventListener('click', () => handleSlashCommandSelection(command));

      // Add bot avatar
      const appMeta = command.__breadcordApplication || command.application;
      if (appMeta && appMeta.icon) {
        const avatar = document.createElement('img');
        avatar.className = `${COMPOSER_CLASS}__slash-command-avatar`;
        const extension = appMeta.icon.startsWith('a_') ? 'gif' : 'png';
        avatar.src = `https://cdn.discordapp.com/app-icons/${appMeta.id}/${appMeta.icon}.${extension}?size=32`;
        avatar.alt = '';
        avatar.onerror = () => {
          avatar.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
        };
        item.appendChild(avatar);
      }

      // Create text container
      const textContainer = document.createElement('div');
      textContainer.className = `${COMPOSER_CLASS}__slash-command-text`;

      const nameEl = document.createElement('span');
      nameEl.className = `${COMPOSER_CLASS}__slash-command-name`;
      nameEl.textContent = `/${normalizeCommandName(command)}`;
      textContainer.appendChild(nameEl);

      const description = normalizeCommandDescription(command);
      if (description) {
        const descriptionEl = document.createElement('span');
        descriptionEl.className = `${COMPOSER_CLASS}__slash-command-description`;
        descriptionEl.textContent = description;
        textContainer.appendChild(descriptionEl);
      }

      item.appendChild(textContainer);
      composerState.slashCommandsContainer.appendChild(item);
    }
  }

  function updateSlashMenuFromValue(value) {
    if (!composerState.textarea || !composerState.slashMenu) return;
    const textValue = typeof value === 'string' ? value : '';

    // If we have a selected command, check if it's still valid
    if (composerState.slashSelectedCommand) {
      hideSlashMenu();
      if (!textValue.length) {
        clearSlashCommandSelection();
        resetSlashMenuState();
        return; // Text is empty, nothing to show
      }
      const parsed = parseInlineCommand(textValue);
      if (!parsed || parsed.commandName !== composerState.slashSelectedCommand.name) {
        clearSlashCommandSelection();
        // Don't call resetSlashMenuState here - let the logic below handle it
        // Continue to show slash menu if it starts with /
        if (!textValue.startsWith('/')) {
          resetSlashMenuState();
          return;
        }
        // Fall through to show slash menu
      } else {
        return;
      }
    }

    if (!textValue.startsWith('/')) {
      resetSlashMenuState();
      return;
    }

    const channelId = getCurrentChannelId();
    if (!channelId) {
      resetSlashMenuState();
      return;
    }

    const guildId = getCurrentGuildId();
    if (!guildId) {
      composerState.slashQuery = extractSlashQuery(textValue);
      composerState.slashGuildId = null;
      showSlashMenu();
      if (composerState.slashTabs) composerState.slashTabs.innerHTML = '';
      if (composerState.slashCommandsContainer) composerState.slashCommandsContainer.innerHTML = '';
      setSlashStatus('Slash commands are not available in this channel.', { loading: false });
      return;
    }

    composerState.slashQuery = extractSlashQuery(textValue);
    composerState.slashGuildId = guildId;
    showSlashMenu();

    if (typeof BreadAPI?.rest?.request !== 'function') {
      if (composerState.slashTabs) composerState.slashTabs.innerHTML = '';
      if (composerState.slashCommandsContainer) composerState.slashCommandsContainer.innerHTML = '';
      setSlashStatus('Slash commands are not available right now.');
      return;
    }

    const cached = getCachedSlashCommands(guildId);
    if (cached) {
      composerState.slashData = cached;
      ensureActiveSlashTab(cached);
      renderSlashMenuFromData(cached);
      return;
    }

    if (composerState.slashTabs) composerState.slashTabs.innerHTML = '';
    if (composerState.slashCommandsContainer) composerState.slashCommandsContainer.innerHTML = '';
    composerState.slashData = null;
    composerState.slashActiveAppId = null;
    setSlashStatus('Loading slash commands…', { loading: true });

    loadSlashCommandsForGuild(guildId, channelId)
      .then((entry) => {
        if (!entry || entry.guildId !== guildId) return;
        if (!composerState.textarea || !composerState.textarea.value.startsWith('/')) {
          return;
        }
        composerState.slashData = entry;
        ensureActiveSlashTab(entry);
        renderSlashMenuFromData(entry);
      })
      .catch((err) => {
        if (getCurrentGuildId() !== guildId) return;
        setSlashStatus(formatSlashLoadError(err));
      });
  }

  function syncSlashMenuWithTextarea() {
    if (!composerState.textarea) return;
    updateSlashMenuFromValue(composerState.textarea.value || '');
  }

  function autoSizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 200;
    const newHeight = Math.min(maxHeight, textarea.scrollHeight + 2);
    textarea.style.height = `${newHeight}px`;
  }

  function updateComposerState() {
    const channelId = getCurrentChannelId();
    const hasChannel = Boolean(channelId);
    const placeholder = hasChannel
      ? `Message ${getCurrentChannelLabel()}`
      : 'Select a channel to send a message';

    if (composerState.currentChannelId !== channelId) {
      if (Array.isArray(composerState.attachments) && composerState.attachments.length) {
        clearAttachments();
      }
      resetSlashMenuState();
      composerState.currentChannelId = channelId;
    }

    if (composerState.textarea) {
      composerState.textarea.placeholder = placeholder;
      if (!hasChannel) {
        composerState.textarea.value = '';
        autoSizeTextarea(composerState.textarea);
      }
    }

    setSending(composerState.sending);
    if (!hasChannel) {
      clearError();
      resetSlashMenuState();
    }
  }

  async function sendMessage(options = {}) {
    if (composerState.slashSelectedCommand) {
      await submitSlashCommand();
      return;
    }
    if (composerState.sending) return;
    const channelId = getCurrentChannelId();
    if (!channelId) {
      showError('Select a channel to send a message.');
      return;
    }

    const pendingAttachments = [];
    if (Array.isArray(composerState.attachments) && composerState.attachments.length) {
      pendingAttachments.push(...composerState.attachments);
    }
    if (Array.isArray(options.attachments) && options.attachments.length) {
      pendingAttachments.push(...options.attachments);
    }
    const textareaValue = composerState.textarea ? composerState.textarea.value : '';
    const content = options.content !== undefined ? options.content : textareaValue;
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!pendingAttachments.length && (!content || !trimmed)) {
      return; // ignore empty submissions
    }

    setSending(true);
    clearError();

    try {
      const payload = {};
      if (content && trimmed.length) {
        payload.content = content;
      } else if (!pendingAttachments.length) {
        payload.content = content;
      }

      const filesPayload = pendingAttachments.map((file, index) => {
        const name = file?.name || `file-${index}`;
        const type = file?.type || 'application/octet-stream';
        const data = file?.data;
        let size = typeof file?.size === 'number' ? file.size : undefined;
        if (size == null && data) {
          if (data instanceof ArrayBuffer) {
            size = data.byteLength;
          } else if (ArrayBuffer.isView(data)) {
            size = data.byteLength;
          } else if (Array.isArray(data)) {
            size = data.length;
          } else if (typeof data === 'string') {
            size = data.length;
          }
        }

        return {
          id: String(index),
          name,
          type,
          size,
          data,
        };
      });

      if (filesPayload.length) {
        payload.attachments = filesPayload.map((file) => ({
          id: file.id,
          filename: file.name,
          original_content_type: file.type,
        }));
      }

      const requestOptions = {
        method: 'POST',
        path: `/channels/${channelId}/messages`,
        body: payload,
      };

      if (filesPayload.length) {
        requestOptions.files = filesPayload;
      }

      await BreadAPI.rest.request(requestOptions);

      if (composerState.textarea) {
        composerState.textarea.value = '';
        autoSizeTextarea(composerState.textarea);
        syncSlashMenuWithTextarea();
      }
      clearAttachments();
    } catch (err) {
      const apiMessage = err?.data?.message || err?.message;
      const errorMessage = apiMessage || 'Failed to send message. Please try again.';
      console.error('[breadcord_messagecomposer] send failed:', err);
      showError(errorMessage);
    } finally {
      setSending(false);
    }
  }

  function handleTextareaKeyDown(event) {
    if (!event) return;
    
    // Handle Escape to close inline choices menu
    if (event.key === 'Escape' && composerState.inlineChoicesMenu && !composerState.inlineChoicesMenu.hidden) {
      event.preventDefault();
      hideInlineChoicesMenu();
      return;
    }
    
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      // If we have a selected slash command, submit it as a slash command
      if (composerState.slashSelectedCommand) {
        submitSlashCommand();
      } else {
        sendMessage();
      }
    }
  }

  function handleTextareaInput(event) {
    autoSizeTextarea(event.target);
    if (event && event.target) {
      const value = event.target.value;
      
      // If we have a selected command, check if the text is still valid
      if (composerState.slashSelectedCommand) {
        // If text doesn't start with /, clear the command
        if (!value.startsWith('/')) {
          clearSlashCommandSelection();
          updateSlashMenuFromValue(value);
          return;
        }
        
        // Check if the command name still matches
        const parsed = parseInlineCommand(value);
        if (!parsed || parsed.commandName !== composerState.slashSelectedCommand.name) {
          clearSlashCommandSelection();
          updateSlashMenuFromValue(value);
          return;
        }
        
        // Still valid, update the choices menu
        updateInlineChoicesMenu();
      } else {
        // Otherwise, update the slash command menu
        updateSlashMenuFromValue(value);
      }
    }
  }

  function markDragState(active) {
    if (!composerState.root) return;
    composerState.root.classList.toggle('is-dragover', Boolean(active));
  }

  async function handleFileDrop(event) {
    event.preventDefault();
    markDragState(false);
    if (composerState.sending) {
      return;
    }
    const channelId = getCurrentChannelId();
    if (!channelId) {
      showError('Select a channel before adding attachments.');
      return;
    }

    const items = event.dataTransfer?.files;
    if (!items || !items.length) {
      return;
    }

    try {
      clearError();
      const attachments = [];
      for (const file of Array.from(items)) {
        if (!file) continue;
        const arrayBuffer = await file.arrayBuffer();
        attachments.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          data: arrayBuffer,
          size: file.size,
        });
      }
      if (!attachments.length) return;

      addAttachments(attachments);
    } catch (err) {
      console.error('[breadcord_messagecomposer] failed to process dropped files', err);
      showError('Failed to upload attachment(s).');
    }
  }

  function createComposerDom() {
    const root = document.createElement('div');
    root.className = COMPOSER_CLASS;

    const slashMenuDom = createSlashMenuDom();
    
    const inlineChoicesMenu = document.createElement('div');
    inlineChoicesMenu.className = `${COMPOSER_CLASS}__inline-choices`;
    inlineChoicesMenu.hidden = true;

  const attachmentsList = document.createElement('div');
  attachmentsList.className = `${COMPOSER_CLASS}__attachments`;
  attachmentsList.hidden = true;

    const inputShell = document.createElement('div');
    inputShell.className = `${COMPOSER_CLASS}__input-shell`;

    const slashFormContainer = document.createElement('div');
    slashFormContainer.className = `${COMPOSER_CLASS}__slash-form`;
    slashFormContainer.hidden = true;

    const textarea = document.createElement('textarea');
    textarea.className = `${COMPOSER_CLASS}__textarea`;
    textarea.setAttribute('rows', '1');
    textarea.setAttribute('placeholder', 'Message #channel');
    textarea.spellcheck = true;
    textarea.autocomplete = 'off';
    textarea.autocapitalize = 'sentences';
    textarea.addEventListener('keydown', handleTextareaKeyDown);
    textarea.addEventListener('input', handleTextareaInput);
    textarea.addEventListener('click', () => {
      if (composerState.slashSelectedCommand) {
        updateInlineChoicesMenu();
      } else {
        updateSlashMenuFromValue(textarea.value);
      }
    });
    textarea.addEventListener('keyup', (e) => {
      // Update on arrow keys and other navigation
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        if (composerState.slashSelectedCommand) {
          updateInlineChoicesMenu();
        }
      }
    });
    textarea.addEventListener('focus', () => {
      if (composerState.slashSelectedCommand) {
        updateInlineChoicesMenu();
      } else {
        updateSlashMenuFromValue(textarea.value);
      }
    });

    inputShell.appendChild(slashFormContainer);
    inputShell.appendChild(textarea);

    const errorEl = document.createElement('div');
    errorEl.className = `${COMPOSER_CLASS}__error`;
    errorEl.hidden = true;

    root.appendChild(slashMenuDom.wrapper);
    root.appendChild(inlineChoicesMenu);
    root.appendChild(attachmentsList);
    root.appendChild(inputShell);
    root.appendChild(errorEl);

    composerState = {
      sending: false,
      root,
      textarea,
      errorEl,
      attachments: [],
      attachmentsList,
      inputShell,
      currentChannelId: getCurrentChannelId(),
      slashMenu: slashMenuDom.wrapper,
      slashTabs: slashMenuDom.tabs,
      slashCommandsContainer: slashMenuDom.commandsContainer,
      slashStatus: slashMenuDom.status,
      slashActiveAppId: null,
      slashData: null,
      slashQuery: '',
      slashGuildId: null,
      slashSelectedCommand: null,
      slashFormContainer,
      slashFormState: null,
      inlineChoicesMenu,
      currentOptionContext: null,
    };

    renderAttachments();
    syncSlashMenuWithTextarea();

    root.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.types && event.dataTransfer.types.includes('Files')) {
        markDragState(true);
      }
    });

    root.addEventListener('dragover', (event) => {
      if (!event.dataTransfer) return;
      if (event.dataTransfer.types && !event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      markDragState(true);
    });

    root.addEventListener('dragleave', (event) => {
      if (!event.relatedTarget || !root.contains(event.relatedTarget)) {
        markDragState(false);
      }
    });

    root.addEventListener('drop', (event) => {
      event.stopPropagation();
      handleFileDrop(event);
    });

    root.addEventListener('keydown', (event) => {
      if (!composerState.slashSelectedCommand) return;
      if (event.defaultPrevented) return;
      if (event.key !== 'Enter') return;
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (!target) return;
      const tag = target.tagName?.toUpperCase();
      if (tag === 'TEXTAREA') return;
      if (tag === 'INPUT' || tag === 'SELECT') {
        event.preventDefault();
        submitSlashCommand();
      }
    });

    autoSizeTextarea(textarea);
    return root;
  }

  function installChannelObserver() {
    const list = getMessageListDom();
    if (!list) return;
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => mutation.type === 'attributes');
      if (relevant) updateComposerState();
    });
    observer.observe(list, { attributes: true, attributeFilter: ['data-channel-id', 'data-channelid'] });
  }

  async function initComposer() {
    ensureStylesheet();

    if (!gatewayListenerAttached && window.BreadAPI?.gateway?.on_message) {
      window.BreadAPI.gateway.on_message(handleGatewayPacket);
      gatewayListenerAttached = true;
    }

    const container = await waitForElement(MESSAGE_CONTAINER_SELECTOR, 15000);
    if (!container) {
      console.warn('[breadcord_messagecomposer] Message container not found; composer not installed.');
      return;
    }

    if (container.querySelector(`.${COMPOSER_CLASS}`)) {
      return; // already installed
    }

    const composerDom = createComposerDom();
    container.appendChild(composerDom);

    const list = await waitForElement(MESSAGE_LIST_SELECTOR, 15000);
    if (list) {
      installChannelObserver();
    }

    updateComposerState();
  }

  if (!gatewayListenerAttached && window.BreadAPI?.gateway?.on_message) {
    window.BreadAPI.gateway.on_message(handleGatewayPacket);
    gatewayListenerAttached = true;
  }

  if (window.BreadAPI && window.BreadAPI.ready) {
    window.BreadAPI.ready.then(initComposer);
  } else {
    document.addEventListener('DOMContentLoaded', initComposer, { once: true });
  }
})();