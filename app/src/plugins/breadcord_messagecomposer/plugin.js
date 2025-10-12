(function () {
  if (typeof window === 'undefined') return;

  const STYLE_PATH = 'plugins/breadcord_messagecomposer/composer.css';
  const COMPOSER_CLASS = 'breadcord-message-composer';
  const MESSAGE_CONTAINER_SELECTOR = '[data-container-id="breadcord-message-container"]';
  const MESSAGE_LIST_SELECTOR = '[data-container-id="breadcord-message-list"]';
  const HEADER_SELECTOR = '[data-type="message-header"]';

  let composerState = {
    sending: false,
    root: null,
    textarea: null,
    errorEl: null,
    attachments: [],
    attachmentsList: null,
    currentChannelId: null,
  };

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
    }
  }

  async function sendMessage(options = {}) {
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
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function handleTextareaInput(event) {
    autoSizeTextarea(event.target);
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

  const attachmentsList = document.createElement('div');
  attachmentsList.className = `${COMPOSER_CLASS}__attachments`;
  attachmentsList.hidden = true;

    const textarea = document.createElement('textarea');
    textarea.className = `${COMPOSER_CLASS}__textarea`;
    textarea.setAttribute('rows', '1');
    textarea.setAttribute('placeholder', 'Message #channel');
    textarea.spellcheck = true;
    textarea.autocomplete = 'off';
    textarea.autocapitalize = 'sentences';
    textarea.addEventListener('keydown', handleTextareaKeyDown);
    textarea.addEventListener('input', handleTextareaInput);

    const errorEl = document.createElement('div');
    errorEl.className = `${COMPOSER_CLASS}__error`;
    errorEl.hidden = true;

    root.appendChild(attachmentsList);
    root.appendChild(textarea);
    root.appendChild(errorEl);

    composerState = {
      sending: false,
      root,
      textarea,
      errorEl,
      attachments: [],
      attachmentsList,
      currentChannelId: getCurrentChannelId(),
    };

    renderAttachments();

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

  if (window.BreadAPI && window.BreadAPI.ready) {
    window.BreadAPI.ready.then(initComposer);
  } else {
    document.addEventListener('DOMContentLoaded', initComposer, { once: true });
  }
})();
