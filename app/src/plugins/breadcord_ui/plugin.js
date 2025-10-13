const breadcord = BreadUI.create_container("breadcord", "vstack", {});
const breadcordNav = BreadUI.create_container("breadcord-nav", "bar", {});
const breadcordApp = BreadUI.create_container("breadcord-app", "hstack", {});

const nav_btn_close = BreadUI.create_element("nav-btn-close", {}, {
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
           <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.42L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z"/>
         </svg>`
})
const nav_btn_minimize = BreadUI.create_element("nav-btn-minimize", {}, {
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
           <rect x="5" y="11" width="14" height="2" rx="1" />
         </svg>`
})
const nav_btn_fullscreen = BreadUI.create_element("nav-btn-fullscreen", {}, {
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
           <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="9 3 3 3 3 9"/>
             <polyline points="15 3 21 3 21 9"/>
             <polyline points="9 21 3 21 3 15"/>
             <polyline points="15 21 21 21 21 15"/>
           </g>
         </svg>`
})

nav_btn_close.onclick(() => { BreadAPI.app.close() });
nav_btn_minimize.onclick(() => { BreadAPI.app.minimize() });
nav_btn_fullscreen.onclick(() => { BreadAPI.app.maximize() });

breadcordNav
  .add(nav_btn_close)
  .add(nav_btn_minimize)
  .add(nav_btn_fullscreen)
  .add(BreadUI.create_element("nav-text", {}, { text: "Breadcord" }))

const breadcord_server_list = BreadUI.create_container("breadcord-server-container", "", {})
const breadcord_channel_list = BreadUI.create_container("breadcord-channel-container", "vstack", {})
const breadcord_message_container = BreadUI.create_container("breadcord-message-container", "vstack", {})
const breadcord_message_header = BreadUI.create_element("message-header", "", { text: "No channel selected" })
const breadcord_message_status = BreadUI.create_element("message-status", "", { text: "Select a channel to view messages." })
const breadcord_message_list = BreadUI.create_container("breadcord-message-list", "vstack", {})

breadcord_channel_list
  .add(BreadUI.create_element("nav-current-location", "", { text: "Direct Messages" }))
  .add(BreadUI.create_container("sidebar-channels-list", "", {}))

breadcord_message_container
  .add(breadcord_message_header)
  .add(breadcord_message_status)
  .add(breadcord_message_list)

breadcordApp
  .add(breadcord_server_list)
  .add(breadcord_channel_list)
  .add(breadcord_message_container)
  .add(BreadUI.create_container("breadcord-app-sidebar", "vstack", {}))

breadcord
  .add(breadcordNav)
  .add(breadcordApp);

breadcord.mount("#app");

const DEFAULT_MESSAGE_HEADER_TEXT = 'No channel selected';
const DEFAULT_MESSAGE_STATUS_TEXT = 'Select a channel to view messages.';

let activeGuildId = null;
let activeChannelId = null;
let activeChannelDom = null;
let displayedChannelId = null;
let channelRequestCounter = 0;
let currentMessageElements = new Map();
const authorRoleMetaCache = new Map();
const pendingMemberRoleFetches = new Map();

const messageListContainer = breadcord_message_list;
const messageHeaderElement = breadcord_message_header;
const messageStatusElement = breadcord_message_status;

// Debug Light/Dark Theme Toggle
const root = document.documentElement;
root.classList.add('dark');
// document.addEventListener('keydown', (e) => {
//   if (e.key.toLowerCase() === 'p' && !e.repeat && (e.ctrlKey || e.metaKey)) {
//     root.classList.toggle('dark');
//     root.classList.toggle('light');
//     e.preventDefault();
//   }
// });

// Load Breadcord CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'plugins/breadcord_ui/theme.css';
document.head.appendChild(link);

function getMessageListDom() {
  return messageListContainer.getDOM();
}

function showMessageStatus(text, { loading = false } = {}) {
  const statusDom = messageStatusElement.getDOM();
  if (!statusDom) return;

  if (!text) {
    statusDom.style.display = 'none';
    statusDom.classList.remove('is-loading');
    statusDom.textContent = '';
    return;
  }

  statusDom.style.display = 'flex';
  statusDom.textContent = text;
  statusDom.classList.toggle('is-loading', Boolean(loading));
}

function hideMessageStatus() {
  showMessageStatus('');
}

function resetMessagePane(message = DEFAULT_MESSAGE_STATUS_TEXT) {
  const listDom = getMessageListDom();
  displayedChannelId = null;
  currentMessageElements.clear();
  if (listDom) {
    listDom.innerHTML = '';
    delete listDom.dataset.channelId;
    delete listDom.dataset.guildId;
  }
  messageHeaderElement.setText(DEFAULT_MESSAGE_HEADER_TEXT);
  showMessageStatus(message);
}

function getNavCurrentLocationElement() {
  return document.querySelector('[data-type="nav-current-location"]');
}

function updateNavLocation(guild, channel = null) {
  const nav = getNavCurrentLocationElement();
  if (!nav) return;

  if (guild) {
    nav.textContent = guild.name || 'Unknown Guild';
  } else {
    nav.textContent = 'Direct Messages';
  }
}

function isTextBasedChannel(channel) {
  if (!channel) return false;
  const type = channel.type;
  if (type === 4 || type === 6 || type === 14) return false; // categories, stores, directories
  if (type === 2 || type === 13) return false; // voice, stage
  return true;
}

function highlightChannelRow(container) {
  if (!container || typeof container.getDOM !== 'function') return;
  const dom = container.getDOM();
  if (!dom) return;

  if (activeChannelDom && activeChannelDom !== dom) {
    activeChannelDom.classList.remove('is-selected');
  }

  activeChannelDom = dom;
  dom.classList.add('is-selected');
}

function isNearBottom(el, threshold = 120) {
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function scrollMessagesToBottom() {
  const listDom = getMessageListDom();
  if (!listDom) return;
  listDom.scrollTop = listDom.scrollHeight;
}

function computeDefaultAvatarIndex(author = {}) {
  if (author.discriminator && author.discriminator !== '0') {
    const parsed = parseInt(author.discriminator, 10);
    if (!Number.isNaN(parsed)) return parsed % 5;
  }
  if (author.id) {
    try {
      return Number(BigInt(author.id) % 6n);
    } catch (err) {
      // ignore BigInt failures
    }
  }
  return 0;
}

function buildAvatarUrl(author = {}, member = {}, guild = {}) {
  if (member.avatar && guild?.id && author?.id) {
    const format = member.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/guilds/${guild.id}/users/${author.id}/avatars/${member.avatar}.${format}?size=64`;
  }
  if (author.avatar && author.id) {
    const format = author.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${format}?size=64`;
  }
  const index = computeDefaultAvatarIndex(author);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function normalizeId(id) {
  if (id == null) return null;
  try {
    return String(id);
  } catch (err) {
    return null;
  }
}

function makeAuthorRoleKey(guildId, userId) {
  const normalizedGuildId = normalizeId(guildId);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedGuildId || !normalizedUserId) return null;
  return `${normalizedGuildId}:${normalizedUserId}`;
}

function getCachedAuthorRoleMeta(guildId, userId) {
  const key = makeAuthorRoleKey(guildId, userId);
  if (!key) return null;
  const meta = authorRoleMetaCache.get(key);
  if (!meta) return null;
  return { ...meta };
}

function updateHeaderRoleIcon(headerEl, meta = {}) {
  if (!headerEl) return;
  const existing = headerEl.querySelector('.breadcord-message__role-icon');
  const clanBadgeEl = Array.from(headerEl.children || []).find(child => child?.classList?.contains('breadcord-message__clan-badge')) || null;
  const hasImage = Boolean(meta?.iconUrl);
  const hasEmoji = Boolean(meta?.iconEmoji);

  if (!hasImage && !hasEmoji) {
    if (existing) existing.remove();
    const authorNameEl = headerEl.querySelector('.breadcord-message__author');
    if (authorNameEl && clanBadgeEl && clanBadgeEl.parentElement === headerEl && authorNameEl.nextSibling !== clanBadgeEl) {
      headerEl.insertBefore(clanBadgeEl, authorNameEl.nextSibling);
    }
    return;
  }

  let iconEl = existing || null;

  if (hasImage) {
    const needsNew = !iconEl || iconEl.tagName !== 'IMG';
    if (needsNew) {
      if (iconEl) iconEl.remove();
      iconEl = document.createElement('img');
      iconEl.className = 'breadcord-message__role-icon';
      iconEl.alt = '';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.loading = 'lazy';
    } else {
      iconEl.classList.add('breadcord-message__role-icon');
      iconEl.classList.remove('breadcord-message__role-icon--emoji');
      iconEl.setAttribute('aria-hidden', 'true');
    }
    if (iconEl.src !== meta.iconUrl) {
      iconEl.src = meta.iconUrl;
    }
  } else if (hasEmoji) {
    const needsNew = !iconEl || iconEl.tagName !== 'SPAN';
    if (needsNew) {
      if (iconEl) iconEl.remove();
      iconEl = document.createElement('span');
      iconEl.className = 'breadcord-message__role-icon breadcord-message__role-icon--emoji';
      iconEl.setAttribute('aria-hidden', 'true');
    } else {
      iconEl.classList.add('breadcord-message__role-icon--emoji');
      iconEl.classList.add('breadcord-message__role-icon');
      iconEl.setAttribute('aria-hidden', 'true');
    }
    iconEl.textContent = meta.iconEmoji;
    if (typeof HTMLImageElement !== 'undefined' && iconEl instanceof HTMLImageElement) {
      iconEl.removeAttribute('src');
    }
  }

  const authorNameEl = headerEl.querySelector('.breadcord-message__author');
  if (authorNameEl && clanBadgeEl && clanBadgeEl.parentElement === headerEl && authorNameEl.nextSibling !== clanBadgeEl) {
    headerEl.insertBefore(clanBadgeEl, authorNameEl.nextSibling);
  }

  const anchorNode = (clanBadgeEl && clanBadgeEl.parentElement === headerEl) ? clanBadgeEl : authorNameEl;
  if (anchorNode) {
    const desiredNext = anchorNode.nextSibling;
    if (desiredNext !== iconEl) {
      headerEl.insertBefore(iconEl, desiredNext);
    }
  } else if (!iconEl.parentElement) {
    headerEl.appendChild(iconEl);
  }
}

function applyAuthorRoleMetaToMessageElements(guildId, userId, meta = {}) {
  const normalizedGuildId = normalizeId(guildId);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;

  currentMessageElements.forEach((element) => {
    if (!element || !element.dataset) return;
    const elementAuthorId = normalizeId(element.dataset.authorId || element.dataset.authorid);
    if (elementAuthorId !== normalizedUserId) return;
    const elementGuildId = normalizeId(element.dataset.guildId || element.dataset.guildid);
    if (normalizedGuildId && elementGuildId && elementGuildId !== normalizedGuildId) return;

    const authorNameEl = element.querySelector('.breadcord-message__author');

    const gradientColors = Array.isArray(meta.gradientColors) && meta.gradientColors.length >= 2
      ? meta.gradientColors
      : null;

    if (gradientColors) {
      element.dataset.authorGradient = gradientColors.join(',');
      element.dataset.authorColor = gradientColors[0];
    } else {
      delete element.dataset.authorGradient;
      if (meta.color) {
        element.dataset.authorColor = meta.color;
      } else {
        delete element.dataset.authorColor;
      }
    }

    if (authorNameEl) {
      applyAuthorNameDecorations(authorNameEl, {
        color: gradientColors ? gradientColors[0] : meta.color,
        gradientColors,
        roleGradient: gradientColors
      });
    }

    if (meta.iconUrl) {
      element.dataset.roleIconUrl = meta.iconUrl;
    } else {
      delete element.dataset.roleIconUrl;
    }

    if (meta.iconEmoji) {
      element.dataset.roleIconEmoji = meta.iconEmoji;
    } else {
      delete element.dataset.roleIconEmoji;
    }

    const header = element.querySelector('.breadcord-message__header');
    if (header) {
      updateHeaderRoleIcon(header, meta);
    }
  });
}

function cacheAuthorRoleMeta(guildId, userId, meta = {}, { applyToDom = false } = {}) {
  const key = makeAuthorRoleKey(guildId, userId);
  if (!key) return;

  const existing = authorRoleMetaCache.get(key) || {};
  const merged = { ...existing };

  if (meta.roleId) {
    const normalizedRoleId = normalizeId(meta.roleId);
    if (normalizedRoleId) merged.roleId = normalizedRoleId;
  }

  if (meta.color) {
    const normalizedColor = normalizeRoleColor(meta.color);
    if (normalizedColor) merged.color = normalizedColor;
  }

  const gradientInputs = [];
  if (meta.gradientColors !== undefined) gradientInputs.push(meta.gradientColors);
  if (meta.gradient !== undefined) gradientInputs.push(meta.gradient);
  if (meta.roleGradient !== undefined) gradientInputs.push(meta.roleGradient);
  if (meta.roleGradients !== undefined) gradientInputs.push(meta.roleGradients);
  if (meta.colors !== undefined) gradientInputs.push(meta.colors);
  if (meta.roleColors !== undefined) gradientInputs.push(meta.roleColors);
  if (meta.role_colors !== undefined) gradientInputs.push(meta.role_colors);
  if (meta.role !== undefined) gradientInputs.push(meta.role);
  if (meta.member !== undefined) gradientInputs.push(meta.member);

  let resolvedGradient = null;
  for (const input of gradientInputs) {
    if (input == null) {
      resolvedGradient = input === null ? null : resolvedGradient;
      continue;
    }
    if (Array.isArray(input)) {
      const normalized = input
        .map(color => normalizeRoleColor(color))
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);
      if (normalized.length >= 2) {
        resolvedGradient = normalized;
        break;
      }
      continue;
    }
    if (typeof input === 'object') {
      const gradient = extractRoleGradientColors(input);
      if (gradient) {
        resolvedGradient = gradient;
        break;
      }
    }
  }

  if (resolvedGradient === null && gradientInputs.some(input => input === null)) {
    delete merged.gradientColors;
  } else if (Array.isArray(resolvedGradient) && resolvedGradient.length >= 2) {
    merged.gradientColors = resolvedGradient;
    merged.color = resolvedGradient[0];
  } else if (gradientInputs.length && resolvedGradient == null) {
    delete merged.gradientColors;
  }

  if (meta.iconUrl !== undefined) {
    if (meta.iconUrl) {
      merged.iconUrl = meta.iconUrl;
    } else {
      delete merged.iconUrl;
    }
  }

  if (meta.iconEmoji !== undefined) {
    if (meta.iconEmoji) {
      merged.iconEmoji = meta.iconEmoji;
    } else {
      delete merged.iconEmoji;
    }
  }

  if (!Object.keys(merged).length) {
    authorRoleMetaCache.delete(key);
  } else {
    authorRoleMetaCache.set(key, merged);
    if (applyToDom) {
      applyAuthorRoleMetaToMessageElements(guildId, userId, merged);
    }
  }
}

async function requestMemberRoleMetaFromApi(guildId, userId) {
  const key = makeAuthorRoleKey(guildId, userId);
  if (!key) return null;
  if (pendingMemberRoleFetches.has(key)) return pendingMemberRoleFetches.get(key);

  const normalizedGuildId = normalizeId(guildId);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedGuildId || !normalizedUserId) return null;

  let guild = resolveGuild(normalizedGuildId);
  let cachedMember = guild ? resolveGuildMember(guild, normalizedUserId) : null;

  if (!cachedMember && Array.isArray(BreadCache?.guilds)) {
    const fallbackGuild = BreadCache.guilds.find(g => normalizeId(g?.id) === normalizedGuildId) || null;
    if (fallbackGuild) {
      if (!guild) guild = fallbackGuild;
      cachedMember = resolveGuildMember(fallbackGuild, normalizedUserId);
    }
  }

  if (cachedMember) {
    const cachedMeta = buildRoleMetaFromMember(cachedMember, guild);
    if (cachedMeta) {
      cacheAuthorRoleMeta(normalizedGuildId, normalizedUserId, cachedMeta, { applyToDom: true });
      return cachedMeta;
    }
  }

  if (!BreadAPI?.rest?.request) return null;

  const fetchPromise = (async () => {
    try {
      const response = await BreadAPI.rest.request({
        method: 'GET',
        path: `/guilds/${guildId}/members/${userId}`,
      });
      const member = response?.data;
      if (!member) return null;

      if (typeof BreadCache?.cacheGuildMember === 'function') {
        try {
          BreadCache.cacheGuildMember(guildId, member);
        } catch (err) {
          console.warn('[breadcord_ui] Failed to merge fetched member into guild cache', err);
        }
      } else if (typeof BreadCache?.cacheGuild === 'function') {
        try {
          BreadCache.cacheGuild({
            id: normalizeId(guildId),
            members: {
              [normalizeId(member.user?.id ?? userId)]: member,
            }
          });
        } catch (err) {
          console.warn('[breadcord_ui] Failed to merge fetched member into guild cache', err);
        }
      }

      let hydratedGuild = resolveGuild(normalizedGuildId) || guild;
      if (!hydratedGuild && Array.isArray(BreadCache?.guilds)) {
        hydratedGuild = BreadCache.guilds.find(g => normalizeId(g?.id) === normalizedGuildId) || null;
      }

      const meta = buildRoleMetaFromMember(member, hydratedGuild);

      if (meta) {
        cacheAuthorRoleMeta(normalizedGuildId, normalizedUserId, meta, { applyToDom: true });
      }

      return meta;
    } catch (err) {
      console.warn('[breadcord_ui] Failed to fetch member for role metadata', guildId, userId, err);
      return null;
    } finally {
      pendingMemberRoleFetches.delete(key);
    }
  })();

  pendingMemberRoleFetches.set(key, fetchPromise);
  return fetchPromise;
}

function getCurrentUserId() {
  try {
    if (typeof BreadCache?.getCurrentUser === 'function') {
      const current = BreadCache.getCurrentUser();
      const normalized = normalizeId(current?.id);
      if (normalized) return normalized;
    }
  } catch (err) {
    // ignore cache failures
  }
  const fallback = normalizeId(BreadCache?.user?.id);
  return fallback || null;
}

function collectRolesFromMember(member, targetId) {
  const roles = new Set();
  if (!member) return roles;
  const memberId = normalizeId(member.user?.id ?? member.id);
  if (!memberId || memberId !== targetId) return roles;
  const roleSources = [member.roles, member.role_ids, member.roleIds];
  for (const source of roleSources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      source.forEach(roleId => {
        const normalized = normalizeId(roleId);
        if (normalized) roles.add(normalized);
      });
    }
  }
  return roles;
}

function collectRolesFromGuild(guild, targetId) {
  const roles = new Set();
  if (!guild || !targetId) return roles;

  const inspectMember = (member) => {
    const memberRoles = collectRolesFromMember(member, targetId);
    memberRoles.forEach(roleId => roles.add(roleId));
  };

  const members = guild.members;
  if (Array.isArray(members)) {
    members.forEach(inspectMember);
  } else if (members && typeof members === 'object') {
    if (typeof members.forEach === 'function') {
      try { members.forEach(inspectMember); } catch (err) { /* ignore */ }
    }
    Object.values(members).forEach(inspectMember);
    if (typeof members.get === 'function') {
      const candidate = members.get(targetId);
      if (candidate) inspectMember(candidate);
    } else {
      const candidate = members[targetId];
      if (candidate) inspectMember(candidate);
    }
  }

  const fallbackKeys = ['member', 'self_member', 'me', 'current_member'];
  fallbackKeys.forEach(key => {
    if (guild[key]) inspectMember(guild[key]);
  });

  return roles;
}

function getCurrentUserRoleIds(guild) {
  const currentUserId = getCurrentUserId();
  if (!currentUserId) return [];

  const aggregated = new Set();
  const consumeGuild = (g) => {
    const guildRoles = collectRolesFromGuild(g, currentUserId);
    guildRoles.forEach(roleId => aggregated.add(roleId));
  };

  if (guild) consumeGuild(guild);

  if ((!aggregated.size) && guild?.id && typeof BreadCache?.getGuild === 'function') {
    try {
      const cached = BreadCache.getGuild(guild.id);
      if (cached && cached !== guild) consumeGuild(cached);
    } catch (err) {
      // ignore cache fetch failures
    }
  }

  return Array.from(aggregated);
}

function normalizeRoleColor(value) {
  if (value == null) return null;

  const asHex = (numeric) => {
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const raw = Math.round(numeric).toString(16);
    const trimmed = raw.length > 6 ? raw.slice(-6) : raw.padStart(6, '0');
    return `#${trimmed}`;
  };

  if (typeof value === 'number') {
    return asHex(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '0') return null;
    if (/^#/i.test(trimmed)) {
      const hex = trimmed.replace(/#/g, '');
      if (/^[0-9a-f]{8}$/i.test(hex)) {
        return `#${hex.slice(-6).toLowerCase()}`;
      }
      if (/^[0-9a-f]{3}$/i.test(hex)) {
        return `#${hex.split('').map(ch => ch + ch).join('').toLowerCase()}`;
      }
      if (/^[0-9a-f]{6}$/i.test(hex)) {
        return `#${hex.toLowerCase()}`;
      }
      return null;
    }
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      return asHex(Number.parseInt(trimmed, 16));
    }
    if (/^[0-9]+$/.test(trimmed)) {
      return asHex(Number(trimmed));
    }
    if (/^[0-9a-f]{6}$/i.test(trimmed)) {
      return `#${trimmed.toLowerCase()}`;
    }
  }

  return null;
}

function extractRoleGradientColors(source) {
  if (!source) return null;
  const colors = [];

  const pushColor = (value) => {
    const normalized = normalizeRoleColor(value);
    if (normalized && !colors.includes(normalized)) {
      colors.push(normalized);
    }
  };

  if (Array.isArray(source)) {
    source.forEach(pushColor);
  }

  const preferredKeys = [
    'primary_color', 'primaryColor',
    'secondary_color', 'secondaryColor',
    'tertiary_color', 'tertiaryColor',
    'quaternary_color', 'quaternaryColor'
  ];

  const processObject = (obj) => {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach(pushColor);
      return;
    }
    preferredKeys.forEach(key => pushColor(obj[key]));
    Object.keys(obj).forEach((key) => {
      if (preferredKeys.includes(key)) return;
      pushColor(obj[key]);
    });
  };

  const directCandidates = [
    source.primary_color,
    source.primaryColor,
    source.secondary_color,
    source.secondaryColor,
    source.tertiary_color,
    source.tertiaryColor,
    source.quaternary_color,
    source.quaternaryColor
  ];
  directCandidates.forEach(pushColor);

  const objectCandidates = [
    source.colors,
    source.colours,
    source.role_colors,
    source.roleColors,
    source.gradient_colors,
    source.gradientColors,
    source.color_gradient,
    source.colorGradient,
    source.gradient
  ];
  objectCandidates.forEach(processObject);

  return colors.length >= 2 ? colors : null;
}

function computeGradientGlowVariants(hex) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const normalized = hex.length === 9 ? `#${hex.slice(-6)}` : hex;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const lighten = (component) => Math.min(255, Math.round(component + (255 - component) * 0.25));
  const lr = lighten(r);
  const lg = lighten(g);
  const lb = lighten(b);
  return {
    weak: `rgba(${lr}, ${lg}, ${lb}, 0.32)`,
    strong: `rgba(${lr}, ${lg}, ${lb}, 0.58)`
  };
}

function applyAuthorNameDecorations(authorNameEl, meta = {}) {
  if (!authorNameEl) return;
  const gradientColors = Array.isArray(meta.gradientColors) && meta.gradientColors.length >= 2
    ? meta.gradientColors
    : (Array.isArray(meta.roleGradient) && meta.roleGradient.length >= 2 ? meta.roleGradient : null);

  if (gradientColors) {
    authorNameEl.classList.add('breadcord-message__author--gradient');
    authorNameEl.style.removeProperty('color');
    authorNameEl.style.setProperty('--role-gradient', `linear-gradient(90deg, ${gradientColors.join(', ')})`);
    const glow = computeGradientGlowVariants(gradientColors[0]);
    if (glow) {
      authorNameEl.style.setProperty('--role-gradient-glow-weak', glow.weak);
      authorNameEl.style.setProperty('--role-gradient-glow-strong', glow.strong);
    } else {
      authorNameEl.style.removeProperty('--role-gradient-glow-weak');
      authorNameEl.style.removeProperty('--role-gradient-glow-strong');
    }
  } else {
    authorNameEl.classList.remove('breadcord-message__author--gradient');
    authorNameEl.style.removeProperty('--role-gradient');
    authorNameEl.style.removeProperty('--role-gradient-glow-weak');
    authorNameEl.style.removeProperty('--role-gradient-glow-strong');
    if (meta.color) {
      authorNameEl.style.color = meta.color;
    } else {
      authorNameEl.style.removeProperty('color');
    }
  }
}

function resolveRolePosition(role) {
  if (!role) return -Infinity;
  const candidates = [role.position, role.rawPosition, role.raw_position, role.rank, role.order];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return -Infinity;
}

function resolveRoleById(guild, roleId) {
  if (!guild || !roleId) return null;
  const normalizedId = normalizeId(roleId);
  if (!normalizedId) return null;

  const matches = (candidate) => candidate && typeof candidate === 'object'
    ? normalizeId(candidate.id) === normalizedId
    : false;

  const visited = new Set();

  const search = (collection) => {
    if (!collection || visited.has(collection)) return null;
    if (typeof collection !== 'object') return null;
    visited.add(collection);

    if (matches(collection)) {
      return collection;
    }

    if (collection instanceof Map) {
      if (collection.has(normalizedId)) {
        const direct = collection.get(normalizedId);
        if (direct) return direct;
      }
      for (const value of collection.values()) {
        const nested = search(value);
        if (nested) return nested;
      }
      return null;
    }

    if (Array.isArray(collection)) {
      for (const item of collection) {
        if (matches(item)) return item;
      }
      for (const item of collection) {
        const nested = typeof item === 'object' ? search(item) : null;
        if (nested) return nested;
      }
      return null;
    }

    if (typeof collection.get === 'function') {
      try {
        const viaGet = collection.get(normalizedId);
        if (viaGet) return viaGet;
      } catch (err) {
        /* ignore */
      }
    }

    if (collection[normalizedId]) {
      const direct = collection[normalizedId];
      if (direct) return direct;
    }

    if (collection.cache && collection.cache !== collection) {
      const viaCache = search(collection.cache);
      if (viaCache) return viaCache;
    }

    if (typeof collection.values === 'function') {
      try {
        for (const value of collection.values()) {
          const nested = search(value);
          if (nested) return nested;
        }
      } catch (err) {
        /* ignore */
      }
    }

    if (typeof collection.forEach === 'function') {
      let resolved = null;
      try {
        collection.forEach((value) => {
          if (resolved) return;
          const nested = search(value);
          if (nested) resolved = nested;
        });
      } catch (err) {
        /* ignore */
      }
      if (resolved) return resolved;
    }

    for (const key of Object.keys(collection)) {
      if (key === normalizedId) {
        const direct = collection[key];
        if (direct) return direct;
      }
    }

    for (const key of Object.keys(collection)) {
      const value = collection[key];
      if (value && typeof value === 'object') {
        const nested = search(value);
        if (nested) return nested;
      }
    }

    return null;
  };

  return search(guild.roles || guild.role_cache || guild.roleCache || null);
}

function resolveGuildMember(guild, userId) {
  if (!guild || !userId) return null;
  const normalizedId = normalizeId(userId);
  if (!normalizedId) return null;

  const matches = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const candidateId = normalizeId(candidate.user?.id ?? candidate.id);
    return candidateId === normalizedId;
  };

  const visited = new Set();

  const search = (collection) => {
    if (!collection || visited.has(collection)) return null;
    if (typeof collection !== 'object') return null;
    visited.add(collection);

    if (matches(collection)) return collection;

    if (collection instanceof Map) {
      if (collection.has(normalizedId)) {
        const direct = collection.get(normalizedId);
        if (direct) return direct;
      }
      for (const value of collection.values()) {
        const nested = search(value);
        if (nested) return nested;
      }
      return null;
    }

    if (Array.isArray(collection)) {
      for (const item of collection) {
        if (matches(item)) return item;
      }
      for (const item of collection) {
        const nested = typeof item === 'object' ? search(item) : null;
        if (nested) return nested;
      }
      return null;
    }

    if (typeof collection.get === 'function') {
      try {
        const viaGet = collection.get(normalizedId);
        if (viaGet) return viaGet;
      } catch (err) {
        /* ignore */
      }
    }

    if (collection[normalizedId]) {
      const direct = collection[normalizedId];
      if (direct) return direct;
    }

    if (collection.cache && collection.cache !== collection) {
      const viaCache = search(collection.cache);
      if (viaCache) return viaCache;
    }

    if (typeof collection.values === 'function') {
      try {
        for (const value of collection.values()) {
          const nested = search(value);
          if (nested) return nested;
        }
      } catch (err) {
        /* ignore */
      }
    }

    if (typeof collection.forEach === 'function') {
      let resolved = null;
      try {
        collection.forEach((value) => {
          if (resolved) return;
          const nested = search(value);
          if (nested) resolved = nested;
        });
      } catch (err) {
        /* ignore */
      }
      if (resolved) return resolved;
    }

    for (const key of Object.keys(collection)) {
      if (key === normalizedId) {
        const direct = collection[key];
        if (direct) return direct;
      }
    }

    for (const key of Object.keys(collection)) {
      const value = collection[key];
      if (value && typeof value === 'object') {
        const nested = search(value);
        if (nested) return nested;
      }
    }

    return null;
  };

  const sources = [guild.members, guild.member_cache, guild.memberCache, guild._members, guild.users];
  for (const source of sources) {
    const member = search(source);
    if (member) return member;
  }

  return null;
}

function buildRoleIconUrl(role) {
  if (!role) return null;
  const roleId = normalizeId(role.id);
  const icon = role.icon || role.icon_hash;
  if (!roleId || !icon) return null;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/role-icons/${roleId}/${icon}.${ext}`;
}

function resolveMemberHighestRoleInfo(member, guild) {
  const roleIds = new Set();
  const collect = (source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach(roleId => {
        const normalized = normalizeId(roleId?.id ?? roleId);
        if (normalized) roleIds.add(normalized);
      });
    } else if (source instanceof Set) {
      source.forEach(roleId => {
        const normalized = normalizeId(roleId?.id ?? roleId);
        if (normalized) roleIds.add(normalized);
      });
    } else if (source instanceof Map) {
      source.forEach((value, key) => {
        const normalizedKey = normalizeId(key);
        if (normalizedKey) roleIds.add(normalizedKey);
        const normalizedValue = normalizeId(value?.id ?? value);
        if (normalizedValue) roleIds.add(normalizedValue);
      });
    } else if (typeof source === 'object') {
      const values = Object.values(source);
      if (values.length) {
        values.forEach(roleId => {
          const normalized = normalizeId(roleId?.id ?? roleId);
          if (normalized) roleIds.add(normalized);
        });
      }
      if (source.cache && source.cache !== source) {
        collect(source.cache);
      }
    }
  };

  collect(member?.roles);
  collect(member?.role_ids);
  collect(member?.roleIds);

  let highestRole = null;
  let highestPosition = -Infinity;
  let highestColorRole = null;
  let highestColorPosition = -Infinity;
  let highestGradient = null;
  let highestGradientPosition = -Infinity;

  roleIds.forEach(roleId => {
    const role = resolveRoleById(guild, roleId);
    if (!role) return;
    const position = resolveRolePosition(role);
    if (position > highestPosition) {
      highestPosition = position;
      highestRole = role;
    }
    const candidateColor = normalizeRoleColor(role.color ?? role.colour ?? role.hexColor ?? role.hex_color);
    if (candidateColor && position >= highestColorPosition) {
      highestColorRole = role;
      highestColorPosition = position;
    }
    if (position >= highestGradientPosition) {
      const gradientColors = extractRoleGradientColors(role);
      if (gradientColors && gradientColors.length >= 2) {
        highestGradient = { role, gradientColors };
        highestGradientPosition = position;
      }
    }
  });

  const meta = {};

  const roleForColor = highestColorRole || highestRole;

  if (highestRole) {
    const iconUrl = buildRoleIconUrl(highestRole);
    if (iconUrl) meta.iconUrl = iconUrl;
    const emoji = highestRole.unicodeEmoji || highestRole.unicode_emoji || highestRole.emoji;
    if (emoji) meta.iconEmoji = emoji;
    const roleId = normalizeId(highestRole.id);
    if (roleId) meta.roleId = roleId;
  }

  if (roleForColor) {
    const color = normalizeRoleColor(roleForColor.color ?? roleForColor.colour ?? roleForColor.hexColor ?? roleForColor.hex_color);
    if (color) meta.color = color;
  }

  if (highestGradient) {
    meta.gradientColors = highestGradient.gradientColors.slice();
    meta.color = meta.gradientColors[0];
  }

  if (!meta.color) {
    const fallbackCandidates = [
      member?.color,
      member?.colour,
      member?.hexColor,
      member?.hex_color,
      member?.roleColor,
      member?.role_color,
      member?.user?.accentColor,
      member?.user?.accent_color
    ];

    for (const candidate of fallbackCandidates) {
      const normalized = normalizeRoleColor(candidate);
      if (normalized) {
        meta.color = normalized;
        break;
      }
    }
  }

  if (!meta.gradientColors) {
    const memberGradient = extractRoleGradientColors(member);
    if (memberGradient) {
      meta.gradientColors = memberGradient;
      if (!meta.color) {
        meta.color = memberGradient[0];
      }
    }
  }

  return Object.keys(meta).length ? meta : null;
}

function buildRoleMetaFromMember(member, guild) {
  if (!member) return null;
  const meta = {};

  const roleInfo = resolveMemberHighestRoleInfo(member, guild);
  if (roleInfo) {
    if (roleInfo.color) meta.color = roleInfo.color;
    if (roleInfo.iconUrl) meta.iconUrl = roleInfo.iconUrl;
    if (roleInfo.iconEmoji) meta.iconEmoji = roleInfo.iconEmoji;
    if (roleInfo.roleId) meta.roleId = roleInfo.roleId;
    if (Array.isArray(roleInfo.gradientColors) && roleInfo.gradientColors.length >= 2) {
      meta.gradientColors = roleInfo.gradientColors.slice();
      if (!meta.color) {
        meta.color = roleInfo.gradientColors[0];
      }
    }
  }

  if (!meta.color) {
    const fallbackCandidates = [
      member?.color,
      member?.colour,
      member?.hexColor,
      member?.hex_color,
      member?.roleColor,
      member?.role_color,
      member?.user?.accentColor,
      member?.user?.accent_color
    ];

    for (const candidate of fallbackCandidates) {
      const normalized = normalizeRoleColor(candidate);
      if (normalized) {
        meta.color = normalized;
        break;
      }
    }
  }

  if (!meta.gradientColors) {
    const memberGradient = extractRoleGradientColors(member);
    if (memberGradient) {
      meta.gradientColors = memberGradient;
      if (!meta.color) {
        meta.color = memberGradient[0];
      }
    }
  }

  return Object.keys(meta).length ? meta : null;
}

function toRenderableMessage(message, guild) {
  if (!message || typeof message !== 'object') return null;
  const author = { ...(message.author || {}) };
  const member = message.member || {};
  const authorId = normalizeId(author.id);
  const guildId = normalizeId(message.guild_id || message.guildId || guild?.id);

  const cachedMeta = getCachedAuthorRoleMeta(guildId, authorId);
  if (cachedMeta) {
    if (Array.isArray(cachedMeta.gradientColors) && cachedMeta.gradientColors.length >= 2) {
      author.roleGradient = [...cachedMeta.gradientColors];
      author.roleColor = cachedMeta.gradientColors[0];
    } else if (cachedMeta.color && !author.roleColor) {
      author.roleColor = cachedMeta.color;
    }
    if (cachedMeta.iconUrl && !author.roleIconUrl) {
      author.roleIconUrl = cachedMeta.iconUrl;
    }
    if (!author.roleIconUrl && cachedMeta.iconEmoji && !author.roleIconEmoji) {
      author.roleIconEmoji = cachedMeta.iconEmoji;
    }
  }

  let guildForColor = guild;
  if ((!guildForColor || !guildForColor.roles) && guildId && typeof BreadCache?.getGuild === 'function') {
    try {
      const cachedGuild = BreadCache.getGuild(guildId);
      if (cachedGuild) guildForColor = cachedGuild;
    } catch (err) {
      guildForColor = guildForColor || null;
    }
  }

  let memberForColor = member;
  if (guildForColor && (!memberForColor || (!Array.isArray(memberForColor.roles) || memberForColor.roles.length === 0))) {
    const fallbackMember = resolveGuildMember(guildForColor, authorId);
    if (fallbackMember) {
      memberForColor = { ...fallbackMember, ...memberForColor };
      if (!Array.isArray(memberForColor.roles) || memberForColor.roles.length === 0) {
        if (Array.isArray(fallbackMember.roles) && fallbackMember.roles.length) {
          memberForColor.roles = [...fallbackMember.roles];
        }
      }
      if (!Array.isArray(memberForColor.role_ids) || memberForColor.role_ids.length === 0) {
        if (Array.isArray(fallbackMember.role_ids) && fallbackMember.role_ids.length) {
          memberForColor.role_ids = [...fallbackMember.role_ids];
        }
      }
      if (!Array.isArray(memberForColor.roleIds) || memberForColor.roleIds.length === 0) {
        if (Array.isArray(fallbackMember.roleIds) && fallbackMember.roleIds.length) {
          memberForColor.roleIds = [...fallbackMember.roleIds];
        }
      }
    }
  }

  if (member.nick) {
    author.displayName = member.nick;
  } else if (!author.displayName) {
    author.displayName = author.global_name || author.username || 'Unknown User';
  }

  author.avatarUrl = buildAvatarUrl(author, member, guild);

  const roleInfo = resolveMemberHighestRoleInfo(memberForColor, guildForColor || guild);
  if (roleInfo) {
    if (roleInfo.color && !author.roleColor) {
      author.roleColor = roleInfo.color;
    }
    if (roleInfo.iconUrl && !author.roleIconUrl) {
      author.roleIconUrl = roleInfo.iconUrl;
    }
    if (!author.roleIconUrl && roleInfo.iconEmoji && !author.roleIconEmoji) {
      author.roleIconEmoji = roleInfo.iconEmoji;
    }
    if (Array.isArray(roleInfo.gradientColors) && roleInfo.gradientColors.length >= 2 && !author.roleGradient) {
      author.roleGradient = [...roleInfo.gradientColors];
      if (!author.roleColor) {
        author.roleColor = roleInfo.gradientColors[0];
      }
    }
  }

  if (!author.roleColor) {
    const accentCandidates = [
      author.roleColor,
      author.role_color,
      author.color,
      author.colour,
      author.hexColor,
      author.hex_color,
      author.accentColor,
      author.accent_color,
      member.user?.accentColor,
      member.user?.accent_color
    ];
    for (const candidate of accentCandidates) {
      const normalized = normalizeRoleColor(candidate);
      if (normalized) {
        author.roleColor = normalized;
        break;
      }
    }
  }

  if (!author.roleGradient) {
    const gradientCandidates = [
      author.roleGradient,
      author.role_gradient,
      author.roleGradients,
      author.role_gradients,
      author.roleColors,
      author.role_colors,
      author.colors,
      author.color_gradient,
      author.colorGradient,
      member.roleGradient,
      member.role_gradient,
      member.roleColors,
      member.role_colors,
      member.colors,
      member.colorGradient,
      member.color_gradient
    ];
    for (const candidate of gradientCandidates) {
      if (!candidate) continue;
      let gradient = null;
      if (Array.isArray(candidate)) {
        gradient = candidate
          .map(color => normalizeRoleColor(color))
          .filter(Boolean)
          .filter((value, index, arr) => arr.indexOf(value) === index);
        if (gradient.length < 2) {
          gradient = null;
        }
      } else if (typeof candidate === 'object') {
        gradient = extractRoleGradientColors(candidate);
      }
      if (gradient && gradient.length >= 2) {
        author.roleGradient = gradient;
        if (!author.roleColor) {
          author.roleColor = gradient[0];
        }
        break;
      }
    }
  }

  const metaToCache = {};
  if (roleInfo?.roleId) metaToCache.roleId = roleInfo.roleId;
  if (author.roleColor) metaToCache.color = author.roleColor;
  if (author.roleIconUrl) metaToCache.iconUrl = author.roleIconUrl;
  if (author.roleIconEmoji) metaToCache.iconEmoji = author.roleIconEmoji;
  if (Array.isArray(author.roleGradient) && author.roleGradient.length >= 2) {
    metaToCache.gradientColors = author.roleGradient;
  }
  if (Object.keys(metaToCache).length) {
    cacheAuthorRoleMeta(guildId, authorId, metaToCache, { applyToDom: true });
  }

  if ((guildId && authorId) && (!author.roleColor || (!author.roleIconUrl && !author.roleIconEmoji))) {
    requestMemberRoleMetaFromApi(guildId, authorId);
  }

  return {
    ...message,
    author,
  };
}

const COMPACT_MAX_GAP_MS = 10 * 60 * 1000;

function normalizeTimestampMs(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      const base = value.seconds * 1000;
      const nanos = typeof value.nanos === 'number' ? value.nanos / 1e6 : 0;
      const total = base + nanos;
      return Number.isFinite(total) ? total : null;
    }
  }
  return null;
}

function getMessageTimestampMs(message) {
  if (!message) return null;
  const candidates = [
    message.timestamp,
    message.messageTimestamp,
    message.message_timestamp,
    message.created_at,
    message.createdAt,
    message.timestamp_ms,
    message.timestampMs,
    message.edited_timestamp,
    message.editedTimestamp
  ];
  for (const candidate of candidates) {
    const ms = normalizeTimestampMs(candidate);
    if (ms != null) return ms;
  }
  return null;
}

function messageContainsEmbeds(message) {
  if (!message) return false;
  const embeds = message.embeds ?? message.embed;
  if (Array.isArray(embeds)) return embeds.length > 0;
  if (embeds && typeof embeds === 'object') return true;
  return false;
}

function collectionHasEntries(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

function messageHasRenderableContent(message) {
  if (!message) return false;
  if (message.__hasRenderableContent === true) return true;

  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (content) return true;

  const systemContent = typeof message.system_content === 'string' ? message.system_content.trim() : '';
  if (systemContent) return true;

  const attachments = message.attachments ?? message.attachment;
  if (collectionHasEntries(attachments)) return true;

  if (messageContainsEmbeds(message)) return true;

  const components = message.components ?? message.component;
  if (collectionHasEntries(components)) return true;

  const stickers = message.sticker_items ?? message.stickerItems ?? message.stickers;
  if (collectionHasEntries(stickers)) return true;

  if (Array.isArray(message.reactions) && message.reactions.length) return true;

  if (message.poll || message.activity || message.application || message.call) return true;

  const interactionName = message.interaction?.name;
  if (interactionName && String(interactionName).trim()) return true;

  const type = message.type ?? message.message_type ?? message.messageType;
  if (typeof type === 'number' && type !== 0) return true;

  return false;
}

function shouldCompactWithPrevious(previousMessage, currentMessage) {
  if (!previousMessage || !currentMessage) return false;
  const previousAuthorId = previousMessage.author?.id ?? null;
  const currentAuthorId = currentMessage.author?.id ?? null;
  if (!previousAuthorId || previousAuthorId !== currentAuthorId) return false;
  if (!messageHasRenderableContent(previousMessage)) return false;
  if (!messageHasRenderableContent(currentMessage)) return false;
  if (messageContainsEmbeds(previousMessage)) return false;
  const previousMs = getMessageTimestampMs(previousMessage);
  const currentMs = getMessageTimestampMs(currentMessage);
  if (previousMs != null && currentMs != null) {
    if ((currentMs - previousMs) > COMPACT_MAX_GAP_MS) {
      return false;
    }
  }
  return true;
}

function annotateMessageElement(element, message) {
  if (!element || !message) return;
  const timestampMs = getMessageTimestampMs(message);
  if (timestampMs != null) {
    element.dataset.timestampMs = String(timestampMs);
  } else {
    delete element.dataset.timestampMs;
  }
  element.dataset.hasEmbed = messageContainsEmbeds(message) ? 'true' : 'false';
  element.dataset.hasRenderableContent = messageHasRenderableContent(message) ? 'true' : 'false';
  const authorColor = normalizeRoleColor(
    message.author?.roleColor ||
    message.author?.role_color ||
    message.author?.color ||
    message.author?.colour ||
    message.author?.hexColor ||
    message.author?.hex_color
  );
  let authorGradient = null;
  const gradientCandidates = [
    message.author?.roleGradient,
    message.author?.role_gradient,
    message.author?.roleGradients,
    message.author?.role_gradients,
    message.author?.roleColors,
    message.author?.role_colors,
    message.author?.colors,
    message.author?.color_gradient,
    message.author?.colorGradient,
    message.author?.gradientColors,
    message.author?.gradient_colors,
    message.author?.colorPalette,
    message.author?.color_palette,
    message.author?.role_color_gradient,
    message.author?.roleColorGradient,
    message.author?.role_color_palette,
    message.author?.roleColorPalette,
    message.authorGradient,
    message.author_gradient
  ];

  for (const candidate of gradientCandidates) {
    if (candidate == null) continue;
    if (Array.isArray(candidate)) {
      const normalized = candidate
        .map(color => normalizeRoleColor(color))
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);
      if (normalized.length >= 2) {
        authorGradient = normalized;
        break;
      }
      continue;
    }
    if (typeof candidate === 'object') {
      const extracted = extractRoleGradientColors(candidate);
      if (extracted) {
        authorGradient = extracted;
        break;
      }
    }
  }

  if (authorGradient) {
    element.dataset.authorGradient = authorGradient.join(',');
    element.dataset.authorColor = authorGradient[0];
  } else {
    delete element.dataset.authorGradient;
    if (authorColor) {
      element.dataset.authorColor = authorColor;
    } else {
      delete element.dataset.authorColor;
    }
  }

  const authorNameEl = element.querySelector('.breadcord-message__author');
  if (authorNameEl) {
    applyAuthorNameDecorations(authorNameEl, {
      color: authorGradient ? authorGradient[0] : authorColor,
      gradientColors: authorGradient,
      roleGradient: authorGradient
    });
  }

  const authorIconUrl = message.author?.roleIconUrl || message.author?.role_icon_url || null;
  if (authorIconUrl) {
    element.dataset.roleIconUrl = authorIconUrl;
  } else {
    delete element.dataset.roleIconUrl;
  }

  const authorIconEmoji = message.author?.roleIconEmoji || message.author?.role_icon_emoji || null;
  if (authorIconEmoji) {
    element.dataset.roleIconEmoji = authorIconEmoji;
  } else {
    delete element.dataset.roleIconEmoji;
  }
}

function stubRenderableFromElement(element) {
  if (!element || !element.dataset) return null;
  const { authorId, hasEmbed, timestampMs, hasRenderableContent, authorColor, authorGradient, roleIconUrl, roleIconEmoji } = element.dataset;
  const stub = {
    author: { id: authorId || null },
  };
  if (hasEmbed === 'true') {
    stub.embeds = [{}];
  }
  if (authorColor) {
    stub.author.roleColor = authorColor;
  }
  if (authorGradient) {
    const gradientColors = authorGradient.split(',')
      .map(color => normalizeRoleColor(color))
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);
    if (gradientColors.length >= 2) {
      stub.author.roleGradient = gradientColors;
      stub.author.roleColor = gradientColors[0];
    }
  }
  if (roleIconUrl) {
    stub.author.roleIconUrl = roleIconUrl;
  }
  if (roleIconEmoji) {
    stub.author.roleIconEmoji = roleIconEmoji;
  }
  if (hasRenderableContent === 'true') {
    stub.__hasRenderableContent = true;
  } else if (hasRenderableContent === 'false') {
    stub.__hasRenderableContent = false;
  } else {
    const contentEl = element.querySelector('.breadcord-message__content');
    const attachmentsEl = element.querySelector('.breadcord-message__attachment, .breadcord-message__embed, .breadcord-inline-video');
    if (contentEl?.textContent?.trim() || attachmentsEl) {
      stub.__hasRenderableContent = true;
    }
  }
  if (timestampMs) {
    const numeric = Number(timestampMs);
    if (Number.isFinite(numeric)) stub.timestamp = numeric;
  }
  return stub;
}

function renderMessages(messages, guild, channelId) {
  const listDom = getMessageListDom();
  displayedChannelId = channelId;
  currentMessageElements = new Map();

  if (listDom) {
    listDom.innerHTML = '';
    listDom.dataset.channelId = channelId;
    if (guild && guild.id) {
      listDom.dataset.guildId = guild.id;
    } else {
      delete listDom.dataset.guildId;
    }
  }

  if (!Array.isArray(messages) || !listDom) return;

  const currentUserId = getCurrentUserId();
  const currentUserRoles = getCurrentUserRoleIds(guild);

  let previousRenderable = null;

  for (const msg of messages) {
    const renderable = toRenderableMessage(msg, guild);
    if (!renderable) continue;
    try {
      const shouldCompact = shouldCompactWithPrevious(previousRenderable, renderable);
      const element = BreadcordMessageRenderer.renderMessage(renderable, {
        compact: shouldCompact,
        guild,
        currentUserId,
        currentUserRoles
      });
      annotateMessageElement(element, renderable);
      listDom.appendChild(element);
      currentMessageElements.set(renderable.id, element);
      previousRenderable = renderable;
    } catch (err) {
      console.error('[breadcord_ui] Failed to render message', err, msg);
    }
    if (typeof BreadCache?.cacheMessage === 'function') {
      BreadCache.cacheMessage(msg);
    }
  }
}

function resolveGuild(guildId) {
  const targetId = normalizeId(guildId ?? activeGuildId);
  if (!targetId) return null;

  if (typeof BreadCache?.getGuild === 'function') {
    try {
      const resolved = BreadCache.getGuild(targetId);
      if (resolved) return resolved;
    } catch (err) {
      /* ignore getter errors */
    }
  }

  if (Array.isArray(BreadCache?.guilds)) {
    const fromList = BreadCache.guilds.find(g => normalizeId(g?.id) === targetId);
    if (fromList) return fromList;
  }

  return null;
}

function recalculateCompactStates() {
  const listDom = getMessageListDom();
  if (!listDom) return;

  const guild = resolveGuild(activeGuildId);
  const currentUserId = getCurrentUserId();
  const currentUserRoles = getCurrentUserRoleIds(guild);
  const children = Array.from(listDom.children || []);
  let previousRenderable = null;

  for (const child of children) {
    if (!child || !child.dataset) {
      previousRenderable = null;
      continue;
    }

    const messageId = child.dataset.messageId;
    if (!messageId) {
      previousRenderable = stubRenderableFromElement(child);
      continue;
    }

    const payload = typeof BreadCache?.getMessage === 'function'
      ? BreadCache.getMessage(messageId)
      : null;
    if (!payload) {
      previousRenderable = stubRenderableFromElement(child);
      continue;
    }

    const renderable = toRenderableMessage(payload, guild);
    if (!renderable) {
      previousRenderable = stubRenderableFromElement(child);
      continue;
    }

    const shouldCompact = shouldCompactWithPrevious(previousRenderable, renderable);
    const isCompact = child.classList.contains('breadcord-message--compact');

    if (shouldCompact !== isCompact) {
      try {
        const replacement = BreadcordMessageRenderer.renderMessage(renderable, {
          compact: shouldCompact,
          guild,
          currentUserId,
          currentUserRoles
        });
        annotateMessageElement(replacement, renderable);
        listDom.replaceChild(replacement, child);
        currentMessageElements.set(messageId, replacement);
        previousRenderable = renderable;
      } catch (err) {
        console.error('[breadcord_ui] Failed to recalculate compact state', err, payload);
      }
      continue;
    }

    annotateMessageElement(child, renderable);
    previousRenderable = renderable;
  }
}

function appendMessage(message, guild) {
  if (!message || !message.id) return;
  const listDom = getMessageListDom();
  if (!listDom) return;

  const stickToBottom = isNearBottom(listDom);
  const renderable = toRenderableMessage(message, guild);
  if (!renderable) return;

  try {
    const currentUserId = getCurrentUserId();
    const currentUserRoles = getCurrentUserRoleIds(guild);
    const previous = listDom.lastElementChild;
    const previousRenderable = previous ? stubRenderableFromElement(previous) : null;
    const shouldCompact = shouldCompactWithPrevious(previousRenderable, renderable);
    const element = BreadcordMessageRenderer.renderMessage(renderable, {
      compact: shouldCompact,
      guild,
      currentUserId,
      currentUserRoles
    });
    annotateMessageElement(element, renderable);
    listDom.appendChild(element);
    currentMessageElements.set(renderable.id, element);
    hideMessageStatus();
    if (typeof BreadCache?.cacheMessage === 'function') {
      BreadCache.cacheMessage(message);
    }
    if (stickToBottom) {
      scrollMessagesToBottom();
    }
  } catch (err) {
    console.error('[breadcord_ui] Failed to append message', err, message);
  }
}

function updateDisplayedMessage(updatePayload, guild) {
  if (!updatePayload || !updatePayload.id) return;
  if (typeof BreadCache?.cacheMessage === 'function') {
    BreadCache.cacheMessage(updatePayload);
  }
  const merged = typeof BreadCache?.getMessage === 'function'
    ? BreadCache.getMessage(updatePayload.id) || { ...updatePayload }
    : { ...updatePayload };

  const listDom = getMessageListDom();
  const existing = currentMessageElements.get(updatePayload.id);
  if (!listDom || !existing) return;

  try {
    const renderable = toRenderableMessage(merged, guild);
    if (!renderable) return;
    const wasCompact = existing.classList.contains('breadcord-message--compact');
    const currentUserId = getCurrentUserId();
    const currentUserRoles = getCurrentUserRoleIds(guild);
    const replacement = BreadcordMessageRenderer.renderMessage(renderable, {
      compact: wasCompact,
      guild,
      currentUserId,
      currentUserRoles
    });
    listDom.replaceChild(replacement, existing);
    currentMessageElements.set(updatePayload.id, replacement);
  } catch (err) {
    console.error('[breadcord_ui] Failed to update message', err, updatePayload);
  }

  recalculateCompactStates();
}

function removeDisplayedMessage(messageId) {
  if (!messageId) return;
  const el = currentMessageElements.get(messageId);
  if (el && el.parentElement) {
    el.parentElement.removeChild(el);
  }
  currentMessageElements.delete(messageId);

  const listDom = getMessageListDom();
  if (listDom && listDom.children.length === 0) {
    showMessageStatus('No messages yet.');
  }

  recalculateCompactStates();
}

resetMessagePane();

function setupTooltips(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  let tooltipElement = null;
  let timeoutId = null;

  const removeTooltip = () => {
    if (!tooltipElement) return;
    // Capture element to remove and clear reference
    const el = tooltipElement;
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    tooltipElement = null;
  };

  container.addEventListener('mouseover', (event) => {
    const target = event.target.closest('[data-type^="guild-"], [data-container-id^="guild-folder-"]');
    if (!target) return;

    // Don't show tooltip for open folders
    if (target.matches('[data-container-id^="guild-folder-"]') && target.classList.contains('is-open')) {
      return;
    }

  const guildId = (target.dataset.type || target.dataset.containerId).replace(/guild-(folder-)?/, '');
    const isFolder = (target.dataset.containerId || '').includes('folder');
    
    let item;
    if (isFolder) {
      const user_guild_prefs = BreadCache.user_settings.guild_folders || [];
      item = user_guild_prefs.find(f => f.id == guildId);
    } else {
      item = BreadCache.getGuild(guildId);
    }

    const text = item?.name;
    if (!text) return;

    // Remove any existing tooltip before creating a new one
    removeTooltip();
    clearTimeout(timeoutId);

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'server-tooltip';
    tooltipElement.textContent = text;
    document.body.appendChild(tooltipElement);

    const rect = target.getBoundingClientRect();
    tooltipElement.style.position = 'absolute';
    tooltipElement.style.top = `${rect.top + (rect.height / 2) - (tooltipElement.offsetHeight / 2)}px`;
    tooltipElement.style.left = `${rect.right + 12}px`;

    // Fade in
    void tooltipElement.offsetWidth;
    tooltipElement.style.opacity = '1';
  });

  container.addEventListener('mouseout', (event) => {
    removeTooltip();
  });
}

function fetch_sorted_guilds() {
  const user_guild_prefs = BreadCache.user_settings.guild_folders;
  console.log("USER SETTINGS", BreadCache.user_settings)
  var guild_order = [];
  for (const folder of user_guild_prefs) {
    if (folder.guild_ids.length === 1) {
      guild_order.push(folder.guild_ids[0]);
    } else if (folder.guild_ids.length > 1) {
      guild_order.push(folder);
    }
  }
  return guild_order;
}

function get_guild_icon_url(guild) {
  return `https://cdn.discordapp.com/icons/${guild?.id}/${guild?.icon}.png`;
}

// Voice channels are always last when under a category
function sort_channels(channels) {
  const arr = Array.isArray(channels) ? channels : Array.from(channels.values?.() ?? channels);
  if (arr.length === 0) return arr;

  // Helpers that work for both discord.js and raw gateway payloads
  const getPos = ch => (ch.rawPosition ?? ch.position ?? 0);
  const getParentId = ch => (ch.parentId ?? ch.parent_id ?? null);
  const hasCmp = (a, b) =>
    typeof a?.comparePositionTo === 'function' && typeof b?.comparePositionTo === 'function';

  // Category = type 4 (or old string enum)
  const isCategory = ch =>
    ch?.type === 4 || ch?.type === 'GUILD_CATEGORY';

  // Voice-like channels: voice (2) + stage (13) or old string enums
  const isVoice = ch =>
    ch?.type === 2 || ch?.type === 'GUILD_VOICE' ||
    ch?.type === 13 || ch?.type === 'GUILD_STAGE_VOICE';

  const nameCmp = (a, b) => (a.name || '').localeCompare(b.name || '');
  const idCmp   = (a, b) => (a.id > b.id ? 1 : -1);
  const baseCmp = (a, b) => getPos(a) - getPos(b) || nameCmp(a, b) || idCmp(a, b);

  // Prefer discord.js comparator when available
  const djCmp = (a, b) => (hasCmp(a, b) ? a.comparePositionTo(b) : baseCmp(a, b));

  // Build a quick index by id
  const byId = new Map(arr.map(ch => [ch.id, ch]));

  // Top-level = categories OR channels with no parent
  const topLevel = arr
    .filter(ch => isCategory(ch) || !getParentId(ch))
    .sort(djCmp);

  // Index children by parent
  const childrenByParent = new Map();
  for (const ch of arr) {
    const pid = getParentId(ch);
    if (!pid) continue;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(ch);
  }

  // Sort each parent's children
  for (const [pid, list] of childrenByParent) {
    const parent = byId.get(pid);

    // Inside categories: voice (and stage) always last
    if (isCategory(parent)) {
      list.sort((a, b) => {
        const va = !!isVoice(a), vb = !!isVoice(b);
        if (va !== vb) return va ? 1 : -1; // non-voice before voice
        return djCmp(a, b);                 // otherwise normal order
      });
    } else {
      // Non-category parents: keep normal order
      list.sort(djCmp);
    }
  }

  // Stitch final order: top-level interleaved by position; each category followed by its children
  const out = [];
  const seen = new Set();

  for (const ch of topLevel) {
    out.push(ch); seen.add(ch.id);
    if (isCategory(ch)) {
      const kids = childrenByParent.get(ch.id);
      if (kids) for (const k of kids) { if (!seen.has(k.id)) { out.push(k); seen.add(k.id); } }
    }
  }

  // Fallback: include any stragglers (e.g., child whose parent isn’t cached)
  for (const ch of arr) if (!seen.has(ch.id)) out.push(ch);

  return out;
}

var VOICE_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" class=""></path><path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" class=""></path></svg>`
var THREAD_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M18.91 12.98a5.45 5.45 0 0 1 2.18 6.2c-.1.33-.09.68.1.96l.83 1.32a1 1 0 0 1-.84 1.54h-5.5A5.6 5.6 0 0 1 10 17.5a5.6 5.6 0 0 1 5.68-5.5c1.2 0 2.32.36 3.23.98Z" class=""></path><path d="M19.24 10.86c.32.16.72-.02.74-.38L20 10c0-4.42-4.03-8-9-8s-9 3.58-9 8c0 1.5.47 2.91 1.28 4.11.14.21.12.49-.06.67l-1.51 1.51A1 1 0 0 0 2.4 18h5.1a.5.5 0 0 0 .49-.5c0-4.2 3.5-7.5 7.68-7.5 1.28 0 2.5.3 3.56.86Z" class=""></path></svg>`
var TEXT_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path  fill-rule="evenodd" d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z" clip-rule="evenodd" class=""></path></svg>`
var ANNOUCEMENT_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M19.56 2a3 3 0 0 0-2.46 1.28 3.85 3.85 0 0 1-1.86 1.42l-8.9 3.18a.5.5 0 0 0-.34.47v10.09a3 3 0 0 0 2.27 2.9l.62.16c1.57.4 3.15-.56 3.55-2.12a.92.92 0 0 1 1.23-.63l2.36.94c.42.27.79.62 1.07 1.03A3 3 0 0 0 19.56 22h.94c.83 0 1.5-.67 1.5-1.5v-17c0-.83-.67-1.5-1.5-1.5h-.94Zm-8.53 15.8L8 16.7v1.73a1 1 0 0 0 .76.97l.62.15c.5.13 1-.17 1.12-.67.1-.41.29-.78.53-1.1Z" clip-rule="evenodd" class=""></path><path d="M2 10c0-1.1.9-2 2-2h.5c.28 0 .5.22.5.5v7a.5.5 0 0 1-.5.5H4a2 2 0 0 1-2-2v-4Z" class=""></path></svg>`
var RULES_CHANNEL_ICON = `<svg class="icon__2ea32" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M15 2a3 3 0 0 1 3 3v12H5.5a1.5 1.5 0 0 0 0 3h14a.5.5 0 0 0 .5-.5V5h1a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h10Zm-.3 5.7a1 1 0 0 0-1.4-1.4L9 10.58l-2.3-2.3a1 1 0 0 0-1.4 1.42l3 3a1 1 0 0 0 1.4 0l5-5Z" clip-rule="evenodd" class=""></path></svg>`

function getChannelIcon(channel, guild) {
  // Special-case: the guild's designated Rules channel
  if (guild?.rules_channel_id && channel.id === guild?.rules_channel_id) {
    return RULES_CHANNEL_ICON;
  }

  switch (channel.type) {
    case 0: // Guild Text
      return TEXT_CHANNEL_ICON;

    case 2: // Guild Voice
    case 13: // Stage Voice
      return VOICE_CHANNEL_ICON;

    case 4: // Category (usually no leading icon; return empty)
      return "";

    case 5: // Announcement / News
      return ANNOUCEMENT_CHANNEL_ICON;

    case 10: // News Thread
    case 11: // Public Thread
    case 12: // Private Thread
      return THREAD_CHANNEL_ICON;

    case 15: // Forum (fallback to text-style icon unless you have a forum icon)
      return TEXT_CHANNEL_ICON;

    default:
      return ""; // Unknown/unsupported: no icon
  }
}

function switch_guild(guild_id) {
  console.log(`Switching to guild ${guild_id}`);

  const guild = BreadCache.getGuild(guild_id);
  activeGuildId = guild_id;
  activeChannelId = null;
  channelRequestCounter += 1; // invalidate any in-flight channel request

  if (activeChannelDom) {
    activeChannelDom.classList.remove('is-selected');
    activeChannelDom = null;
  }

  resetMessagePane();
  updateNavLocation(guild);

  const sidebar_channels_list = document.querySelector('[data-container-id="sidebar-channels-list"]');
  const sidebar_channels_list_ui = BreadUI.get_container('sidebar-channels-list');
  if (!sidebar_channels_list || !sidebar_channels_list_ui) return;

  sidebar_channels_list_ui.children.length = 0;
  while (sidebar_channels_list.firstChild) {
    sidebar_channels_list.removeChild(sidebar_channels_list.firstChild);
  }
  sidebar_channels_list.scrollTop = 0;

  const channels = guild?.channels;
  const sorted_channels = sort_channels(channels || []);

  console.log('Sorted Channels:', sorted_channels);

  for (const channel of sorted_channels) {
    const iconHtml = getChannelIcon(channel, guild);
    let channel_element;

    if (channel.type === 4) {
      channel_element = BreadUI.create_element(`category-${channel.id}`, {}, { text: channel.name });
    } else {
      channel_element = BreadUI.create_container(`channel-${channel.id}`, '', {});
      const channel_element_icon = BreadUI.create_element(`channelicon-${channel.id}`, {}, { html: iconHtml });
      const channel_element_text = BreadUI.create_element(`channeltext-${channel.id}`, {}, { text: channel.name || 'Unnamed Channel' });
      channel_element.add(channel_element_icon);
      channel_element.add(channel_element_text);

      if (isTextBasedChannel(channel)) {
        channel_element.onclick(() => handleChannelSelect(guild, channel, channel_element));
      }
    }

    sidebar_channels_list_ui.add(channel_element);

    const domNode = typeof channel_element.getDOM === 'function' ? channel_element.getDOM() : null;
    if (domNode && channel.type !== 4) {
      domNode.dataset.channelId = channel.id;
      domNode.dataset.channelType = String(channel.type);
      if (!isTextBasedChannel(channel)) {
        domNode.classList.add('is-disabled');
      }
    }
  }
}

async function handleChannelSelect(guild, channel, container) {
  if (!channel || !isTextBasedChannel(channel)) return;
  if (activeChannelId === channel.id && displayedChannelId === channel.id) return;

  highlightChannelRow(container);
  activeChannelId = channel.id;
  activeGuildId = guild?.id ?? activeGuildId;

  const normalizedGuildId = normalizeId(activeGuildId);
  const normalizedChannelId = normalizeId(channel.id);
  if (normalizedGuildId && normalizedChannelId && BreadAPI?.gateway?.send) {
    try {
      BreadAPI.gateway.send({
        op: 14,
        d: {
          guild_id: normalizedGuildId,
          typing: true,
          activities: true,
          threads: true,
          channels: {
            [normalizedChannelId]: [[0, 99]]
          }
        }
      });
    } catch (err) {
      console.warn('[breadcord_ui] Failed to send channel subscription payload', err);
    }
  }

  const requestId = ++channelRequestCounter;

  const listDom = getMessageListDom();
  if (listDom) {
    listDom.innerHTML = '';
    listDom.dataset.channelId = channel.id;
    if (guild && guild.id) {
      listDom.dataset.guildId = guild.id;
    } else {
      delete listDom.dataset.guildId;
    }
  }

  messageHeaderElement.setText(channel.name ? `#${channel.name}` : 'Messages');
  showMessageStatus('Loading messages…', { loading: true });
  updateNavLocation(guild, channel);

  try {
    const { data } = await BreadAPI.rest.request({
      method: 'GET',
      path: `/channels/${channel.id}/messages?limit=50`,
    });

    if (requestId !== channelRequestCounter) return;

    const messages = Array.isArray(data) ? data.slice().reverse() : [];
    renderMessages(messages, guild, channel.id);

    if (messages.length === 0) {
      showMessageStatus('No messages yet.');
    } else {
      hideMessageStatus();
      scrollMessagesToBottom();
    }
  } catch (error) {
    if (requestId !== channelRequestCounter) return;
    console.error('[breadcord_ui] Failed to fetch channel messages', error);
    if (error?.status === 403) {
      showMessageStatus('You do not have permission to view this channel.');
    } else if (error?.status === 404) {
      showMessageStatus('This channel could not be found.');
    } else {
      showMessageStatus('Failed to load messages. Try again later.');
    }
  }
}

BreadCache.on_ready(() => {
  let user_corner_profile_card_style = {};
  if (BreadCache?.user?.collectibles?.nameplate?.asset) {
    user_corner_profile_card_style = {
      backgroundImage: `url(https://cdn.discordapp.com/assets/collectibles/${BreadCache.user.collectibles.nameplate.asset}static.png)` // or asset.webm
    };
  }
  const user_corner_profile_card = BreadUI.create_container(`user-corner-profile-card`, "", user_corner_profile_card_style);
  breadcord.add(user_corner_profile_card);

  const user_corner_profile_card_text_name = BreadUI.create_element(`user-corner-profile-card-text-name`, "", {text: BreadCache.user.global_name || BreadCache.user.username});
  const user_corner_profile_card_text_status = BreadUI.create_element(`user-corner-profile-card-text-status`, "", {text: BreadCache.user_settings?.custom_status?.text || BreadCache.user.username});
  const user_corner_profile_card_settings_btn = BreadUI.create_element(`user-corner-profile-card-settings-btn`, "", { html: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="24" height="24" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="__lottie_element_101"><rect width="24" height="24" x="0" y="0"></rect></clipPath><clipPath id="__lottie_element_103"><path d="M0,0 L600,0 L600,600 L0,600z"></path></clipPath></defs><g clip-path="url(#__lottie_element_101)"><g clip-path="url(#__lottie_element_103)" transform="matrix(0.03999999910593033,0,0,0.03999999910593033,0,0)" opacity="1" style="display: block;"><g transform="matrix(25,0,0,25,300,300)" opacity="1" style="display: block;"><g opacity="1" transform="matrix(1,0,0,1,0,0)"><path fill-opacity="1" d=" M-1.4420000314712524,-10.906000137329102 C-1.8949999809265137,-10.847000122070312 -2.1470000743865967,-10.375 -2.078000068664551,-9.92300033569336 C-1.899999976158142,-8.756999969482422 -2.265000104904175,-7.7210001945495605 -3.061000108718872,-7.390999794006348 C-3.8570001125335693,-7.060999870300293 -4.8480000495910645,-7.534999847412109 -5.546000003814697,-8.484999656677246 C-5.816999912261963,-8.852999687194824 -6.329999923706055,-9.008999824523926 -6.691999912261963,-8.730999946594238 C-7.458000183105469,-8.142999649047852 -8.142999649047852,-7.458000183105469 -8.730999946594238,-6.691999912261963 C-9.008999824523926,-6.329999923706055 -8.852999687194824,-5.816999912261963 -8.484999656677246,-5.546000003814697 C-7.534999847412109,-4.8480000495910645 -7.060999870300293,-3.8570001125335693 -7.390999794006348,-3.061000108718872 C-7.7210001945495605,-2.265000104904175 -8.756999969482422,-1.899999976158142 -9.92300033569336,-2.078000068664551 C-10.375,-2.1470000743865967 -10.847000122070312,-1.8949999809265137 -10.906000137329102,-1.4420000314712524 C-10.968000411987305,-0.9700000286102295 -11,-0.48899999260902405 -11,0 C-11,0.48899999260902405 -10.968000411987305,0.9700000286102295 -10.906000137329102,1.4420000314712524 C-10.847000122070312,1.8949999809265137 -10.375,2.1470000743865967 -9.92300033569336,2.078000068664551 C-8.756999969482422,1.899999976158142 -7.7210001945495605,2.265000104904175 -7.390999794006348,3.061000108718872 C-7.060999870300293,3.8570001125335693 -7.534999847412109,4.8470001220703125 -8.484999656677246,5.546000003814697 C-8.852999687194824,5.816999912261963 -9.008999824523926,6.328999996185303 -8.730999946594238,6.691999912261963 C-8.142999649047852,7.458000183105469 -7.458000183105469,8.142999649047852 -6.691999912261963,8.730999946594238 C-6.329999923706055,9.008999824523926 -5.816999912261963,8.852999687194824 -5.546000003814697,8.484999656677246 C-4.8480000495910645,7.534999847412109 -3.8570001125335693,7.060999870300293 -3.061000108718872,7.390999794006348 C-2.265000104904175,7.7210001945495605 -1.899999976158142,8.756999969482422 -2.078000068664551,9.92300033569336 C-2.1470000743865967,10.375 -1.8949999809265137,10.847000122070312 -1.4420000314712524,10.906000137329102 C-0.9700000286102295,10.968000411987305 -0.48899999260902405,11 0,11 C0.48899999260902405,11 0.9700000286102295,10.968000411987305 1.4420000314712524,10.906000137329102 C1.8949999809265137,10.847000122070312 2.1470000743865967,10.375 2.078000068664551,9.92300033569336 C1.899999976158142,8.756999969482422 2.2660000324249268,7.7210001945495605 3.062000036239624,7.390999794006348 C3.8580000400543213,7.060999870300293 4.8480000495910645,7.534999847412109 5.546000003814697,8.484999656677246 C5.816999912261963,8.852999687194824 6.328999996185303,9.008999824523926 6.691999912261963,8.730999946594238 C7.458000183105469,8.142999649047852 8.142999649047852,7.458000183105469 8.730999946594238,6.691999912261963 C9.008999824523926,6.328999996185303 8.852999687194824,5.816999912261963 8.484999656677246,5.546000003814697 C7.534999847412109,4.8480000495910645 7.060999870300293,3.8570001125335693 7.390999794006348,3.061000108718872 C7.7210001945495605,2.265000104904175 8.756999969482422,1.899999976158142 9.92300033569336,2.078000068664551 C10.375,2.1470000743865967 10.847000122070312,1.8949999809265137 10.906000137329102,1.4420000314712524 C10.968000411987305,0.9700000286102295 11,0.48899999260902405 11,0 C11,-0.48899999260902405 10.968000411987305,-0.9700000286102295 10.906000137329102,-1.4420000314712524 C10.847000122070312,-1.8949999809265137 10.375,-2.1470000743865967 9.92300033569336,-2.078000068664551 C8.756999969482422,-1.899999976158142 7.7210001945495605,-2.265000104904175 7.390999794006348,-3.061000108718872 C7.060999870300293,-3.8570001125335693 7.534999847412109,-4.8480000495910645 8.484999656677246,-5.546000003814697 C8.852999687194824,-5.816999912261963 9.008999824523926,-6.329999923706055 8.730999946594238,-6.691999912261963 C8.142999649047852,-7.458000183105469 7.458000183105469,-8.142999649047852 6.691999912261963,-8.730999946594238 C6.328999996185303,-9.008999824523926 5.817999839782715,-8.852999687194824 5.546999931335449,-8.484999656677246 C4.848999977111816,-7.534999847412109 3.8580000400543213,-7.060999870300293 3.062000036239624,-7.390999794006348 C2.2660000324249268,-7.7210001945495605 1.9010000228881836,-8.756999969482422 2.0789999961853027,-9.92300033569336 C2.1480000019073486,-10.375 1.8949999809265137,-10.847000122070312 1.4420000314712524,-10.906000137329102 C0.9700000286102295,-10.968000411987305 0.48899999260902405,-11 0,-11 C-0.48899999260902405,-11 -0.9700000286102295,-10.968000411987305 -1.4420000314712524,-10.906000137329102z M4,0 C4,2.2090001106262207 2.2090001106262207,4 0,4 C-2.2090001106262207,4 -4,2.2090001106262207 -4,0 C-4,-2.2090001106262207 -2.2090001106262207,-4 0,-4 C2.2090001106262207,-4 4,-2.2090001106262207 4,0z"></path></g></g></g></g></svg>`});
  const user_corner_profile_card_plugins_btn = BreadUI.create_element(`user-corner-profile-card-plugins-btn`, "", { html: `<?xml version="1.0" standalone="no"?> <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd"> <svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900.000000 900.000000" preserveAspectRatio="xMidYMid meet"> <g transform="translate(0.000000,900.000000) scale(0.100000,-0.100000)" stroke="none"> <path d="M4250 7251 c-58 -4 -137 -14 -175 -20 -185 -33 -303 -60 -380 -87 -23 -8 -46 -14 -53 -14 -25 0 -279 -105 -397 -164 -360 -178 -706 -463 -945 -776 -19 -25 -38 -49 -43 -55 -78 -101 -202 -304 -251 -410 -16 -33 -35 -73 -43 -90 -75 -154 -203 -575 -203 -671 0 -16 -5 -45 -10 -64 -15 -49 -32 -332 -21 -343 5 -5 34 -2 67 6 33 8 95 23 139 32 99 21 216 46 233 51 7 2 12 20 12 45 0 104 55 363 117 549 213 635 733 1177 1358 1412 297 112 508 150 836 149 300 0 457 -24 724 -111 341 -110 626 -284 893 -544 272 -265 467 -577 582 -931 87 -269 110 -418 110 -725 0 -308 -21 -449 -110 -727 -19 -60 -29 -86 -56 -150 -8 -17 -14 -34 -14 -38 0 -4 -27 -62 -61 -129 -269 -535 -767 -968 -1319 -1148 -294 -96 -442 -119 -750 -120 -297 0 -457 25 -725 112 -160 52 -248 90 -421 185 -130 72 -334 221 -334 245 0 9 26 40 58 69 31 29 93 88 137 130 200 191 358 337 375 345 14 6 28 1 57 -21 106 -82 211 -133 368 -180 92 -27 401 -24 506 4 84 23 163 49 194 62 58 26 174 84 200 101 17 11 37 23 45 27 28 13 205 151 263 205 61 57 67 74 40 99 -20 17 -104 106 -228 239 -74 80 -132 141 -329 350 -45 47 -112 119 -150 160 -38 41 -133 142 -210 225 -78 82 -175 185 -216 230 -164 174 -245 260 -255 271 -122 133 -280 294 -288 294 -28 0 -179 -145 -272 -260 -62 -77 -135 -183 -135 -196 0 -4 -6 -15 -13 -23 -8 -9 -27 -50 -44 -91 -83 -202 -96 -262 -96 -460 0 -140 4 -178 23 -249 29 -109 68 -200 130 -303 l50 -83 -62 -60 c-68 -65 -344 -325 -387 -364 -199 -183 -471 -443 -471 -450 0 -12 165 -196 255 -285 127 -125 378 -323 455 -359 8 -4 29 -16 45 -27 79 -50 240 -133 342 -175 49 -20 102 -42 118 -49 107 -44 390 -121 508 -136 34 -5 91 -14 127 -21 84 -16 589 -16 683 0 37 6 97 16 134 21 133 21 287 61 463 123 160 56 417 180 533 257 32 22 61 40 64 40 2 0 50 35 106 77 231 173 417 359 590 590 42 56 77 104 77 106 0 3 18 31 39 63 53 80 150 268 201 389 132 311 203 629 215 965 7 172 -5 431 -25 541 -38 207 -73 351 -115 469 -129 364 -304 669 -534 929 -155 176 -369 365 -526 468 -38 25 -81 53 -95 63 -71 48 -267 150 -377 195 -49 20 -101 42 -118 49 -74 31 -300 96 -415 119 -223 46 -555 66 -800 48z"/> <path d="M4705 5913 c-42 -22 -69 -46 -250 -217 -88 -83 -194 -182 -235 -221 -178 -167 -220 -210 -218 -221 4 -19 259 -284 272 -284 6 0 34 21 61 47 186 174 547 514 581 547 23 23 49 58 58 80 30 72 14 168 -37 224 -52 57 -169 79 -232 45z"/> <path d="M5639 4923 c-41 -21 -69 -44 -268 -232 -79 -75 -155 -147 -170 -160 -156 -144 -271 -256 -271 -265 1 -10 34 -47 202 -223 33 -35 65 -63 72 -63 12 0 42 26 191 168 85 80 177 167 354 332 74 70 142 143 154 165 65 125 -29 284 -173 292 -38 2 -66 -2 -91 -14z"/> </g> </svg>`});


  const user_corner_profile_card_text = BreadUI.create_container(`user-corner-profile-card-text`, "", {});
  user_corner_profile_card_text
    .add(user_corner_profile_card_text_name)
    .add(user_corner_profile_card_text_status)
  user_corner_profile_card
    .add(user_corner_profile_card_text)
    .add(user_corner_profile_card_settings_btn)
    .add(user_corner_profile_card_plugins_btn)

  let user_corner_profile_card_style_avatar = {};

  if (BreadCache?.user?.avatar) {
    user_corner_profile_card_style_avatar.backgroundImage = `url(https://cdn.discordapp.com/avatars/${BreadCache.user.id}/${BreadCache.user.avatar}.png)`;
  }
  else {
    user_corner_profile_card_style_avatar.backgroundImage = `url(https://cdn.discordapp.com/embed/avatars/1.png)`;
  }

  const user_corner_profile_card_avatar = BreadUI.create_container(`user-corner-profile-card-avatar`, "", user_corner_profile_card_style_avatar);
  user_corner_profile_card.add(user_corner_profile_card_avatar);

  if (BreadCache?.user?.avatar_decoration_data?.asset) {
    user_corner_profile_card_avatar.add(BreadUI.create_container(`user-corner-profile-card-avatar-decoration`, "", {
      backgroundImage: `url(https://cdn.discordapp.com/avatar-decoration-presets/${BreadCache.user.avatar_decoration_data.asset}.png?size=240&passthrough=true)`
    }));
  }

  console.log("[breadcord_ui] BreadCache Ready, beginning to load servers");
  setupTooltips('[data-container-id="breadcord-server-container"]');
  const sorted_guilds = fetch_sorted_guilds();
  console.log(sorted_guilds)

  // helper to attach toggle behavior to a folder element
  const attachFolderToggle = (folder) => {
    if (!folder) return;

      const setA11y = () => {
        const open = folder.classList.contains('is-open');
        folder.setAttribute('role', 'button');
        folder.setAttribute('tabindex', '0');
        folder.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      const open = () => { folder.classList.add('is-open'); setA11y(); };
      const close = () => { folder.classList.remove('is-open'); setA11y(); };
      const toggle = () => { folder.classList.toggle('is-open'); setA11y(); };

      setA11y();

      // Only toggle when the folder's expand icon/button is clicked.
      // The expand button element is created with an id-like key of `guild-folderexpand-<id>`
      // BreadUI sets a data attribute we can query for; attempt to find that child and attach handlers.
      const expandBtn = Array.from(folder.querySelectorAll('[data-element-id], [data-element], [id]'))
        .find(el => {
          const attrId = el.getAttribute('data-element-id') || el.getAttribute('data-element') || el.id || '';
          return attrId.includes('guild-folderexpand-');
        });

      if (expandBtn) {
        // Click on the expand button toggles open/close
        expandBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        });

        // Keyboard toggle on the expand button (Enter / Space)
        expandBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }
        });
      } else {
        // Fallback: if we couldn't find the expand button, keep old behavior limited to folder element only
        folder.addEventListener('click', (e) => {
          if (!folder.classList.contains('is-open')) {
            e.preventDefault();
            e.stopPropagation();
            open();
          } else if (e.target === folder) {
            // only collapse if clicking the empty area of the folder, not a child icon
            close();
          }
        });

        folder.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });
      }
  };

  for (const guild_id of sorted_guilds) {
    if (typeof guild_id === 'object' && !Array.isArray(guild_id) && guild_id !== null) {
      const guild_ids = guild_id.guild_ids;
      var style = {};
      var expand_style = {};
      if (guild_id.color) {
        style.backgroundColor = `#${guild_id.color.toString(16).padStart(6, '0')}4D`;
        expand_style.color = `#${guild_id.color.toString(16).padStart(6, '0')}FF`;
      }

      // Create folder container
      const folder_container = BreadUI.create_container(`guild-folder-${guild_id.id}`, "", style);

      const expand_btn = BreadUI.create_element(`guild-folderexpand-${guild_id.id}`, expand_style, {html: `<svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M2 5a3 3 0 0 1 3-3h3.93a2 2 0 0 1 1.66.9L12 5h7a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5Z" class=""></path></svg>`});
      folder_container.add(expand_btn);

      // Add each guild inside the folder
      for (const g_id of guild_ids) {
        const guild = BreadCache.getGuild(g_id);
        if (!guild) {
          console.warn(`Skipping undefined guild in folder (id=${g_id})`);
          continue;
        }

        if (guild.icon) {
          const guild_btn = BreadUI.create_element(`guild-${guild.id}`, { backgroundImage: `url(${get_guild_icon_url(guild)})` }, {});
          guild_btn.onclick(() => { switch_guild(guild.id); });
          folder_container.add(guild_btn);
        } else {
          const name = guild.name ? guild.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 4) : '???';
          const guild_btn = BreadUI.create_element(`guild-${guild.id}`, {}, { text: name });
          guild_btn.onclick(() => { switch_guild(guild.id); });
          folder_container.add(guild_btn);
        }
      }

      // Insert into the server list
      breadcord_server_list.add(folder_container);

      // Attach toggle behavior to this specific folder DOM node
      const folder = document.querySelector(`[data-container-id="guild-folder-${guild_id.id}"]`);
      attachFolderToggle(folder);

    } else {
      // Single (non-folder) guilds
      const guild = BreadCache.getGuild(guild_id);
      if (!guild) {
        console.warn(`Skipping undefined guild (id=${guild_id})`);
        continue;
      }

      if (guild.icon) {
        const guild_btn = BreadUI.create_element(
          `guild-${guild.id}`,
          { backgroundImage: `url(${get_guild_icon_url(guild)})` },
          {}
        );
        breadcord_server_list.add(guild_btn);
        guild_btn.onclick(() => switch_guild(guild.id));
      } else {
        if (!guild.name) {
          console.warn("Guild has no name:", guild);
        }

        const name = guild.name
          ? guild.name
              .split(/\s+/)
              .map(w => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 4)
          : "???";

        if (name === "???") {
          console.warn("Guild has no name:", guild);
        }

        const guild_btn = BreadUI.create_element(
          `guild-${guild.id}`,
          {},
          { text: name }
        );

        guild_btn.onclick(() => switch_guild(guild.id));
        breadcord_server_list.add(guild_btn);
      }

    }
  }
});

  BreadAPI.gateway.on_message((packet) => {
    const { t, d } = packet || {};
    if (!d) return;

    switch (t) {
      case 'MESSAGE_CREATE': {
        if (typeof BreadCache?.cacheMessage === 'function') {
          BreadCache.cacheMessage(d);
        }
        if (d.channel_id === displayedChannelId) {
          const guild = resolveGuild(d.guild_id);
          appendMessage(d, guild);
        }
        break;
      }
      case 'MESSAGE_UPDATE': {
        if (d.channel_id === displayedChannelId) {
          const guild = resolveGuild(d.guild_id);
          updateDisplayedMessage(d, guild);
        } else if (typeof BreadCache?.cacheMessage === 'function') {
          BreadCache.cacheMessage(d);
        }
        break;
      }
      case 'MESSAGE_DELETE': {
        if (d.channel_id === displayedChannelId) {
          removeDisplayedMessage(d.id);
        }
        if (typeof BreadCache?.deleteMessage === 'function') {
          BreadCache.deleteMessage(d.id);
        }
        break;
      }
      case 'MESSAGE_DELETE_BULK': {
        if (Array.isArray(d.ids)) {
          if (d.channel_id === displayedChannelId) {
            d.ids.forEach(removeDisplayedMessage);
          }
          if (typeof BreadCache?.deleteMessage === 'function') {
            d.ids.forEach((id) => BreadCache.deleteMessage(id));
          }
        }
        break;
      }
      default:
        break;
    }
  });