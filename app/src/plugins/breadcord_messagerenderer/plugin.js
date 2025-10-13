(function () {
  const STYLE_PATH = 'plugins/breadcord_messagerenderer/message.css';

  function ensureStylesheet() {
    if (document.querySelector(`link[href="${STYLE_PATH}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_PATH;
    link.addEventListener('error', () => console.warn('[breadcord_messagerenderer] Failed to load stylesheet at', STYLE_PATH), { once: true });
    document.head.appendChild(link);
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (typeof text === 'string') e.textContent = text;
    return e;
  }

  function safeText(t) { return t == null ? '' : String(t); }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const TOOLTIP_FORMATTER = typeof Intl !== 'undefined' && Intl.DateTimeFormat
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'medium' })
    : null;

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  function startOfLocalDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatTime12(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const suffix = hours >= 12 ? ' PM' : '';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes}${suffix}`;
  }

  function formatDate24(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  }

  function formatTooltipDate(date) {
    if (!date) return '';
    try {
      if (TOOLTIP_FORMATTER) return TOOLTIP_FORMATTER.format(date);
    } catch (err) {
      /* ignore formatter errors */
    }
    return date.toLocaleString();
  }

  function fmtTs(iso) {
    const date = toDate(iso);
    if (!date) return '';

    const now = new Date();
    const diffDays = Math.floor((startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / MS_PER_DAY);

    if (diffDays <= 0) {
      return formatTime12(date);
    }

    if (diffDays === 1) {
      return `Yesterday at ${formatTime12(date)}`;
    }

    return formatDate24(date);
  }

  // Formats a Date according to Discord's timestamp style letters
  function formatDiscordTimestamp(date, style) {
    if (!date) return '';
    const styles = String(style || 'f');
    // helper formatters
    const shortTime = () => formatTime12(date);
    const longTime = () => date.toLocaleTimeString();
    const shortDate = () => {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      return `${m}/${d}/${y}`;
    };
    const longDate = () => date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const shortDateTime = () => `${longDate()} ${shortTime()}`;
    const longDateTime = () => date.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
    if (styles === 't') return shortTime();
    if (styles === 'T') return longTime();
    if (styles === 'd') return shortDate();
    if (styles === 'D') return longDate();
    if (styles === 'f') return shortDateTime();
    if (styles === 'F') return longDateTime();
    if (styles === 'R') {
      // relative time
      const now = Date.now();
      const diff = Math.round((date.getTime() - now) / 1000);
      const abs = Math.abs(diff);
      if (abs < 60) return diff >= 0 ? `in ${abs} seconds` : `${abs} seconds ago`;
      if (abs < 3600) {
        const m = Math.round(abs / 60);
        return diff >= 0 ? `in ${m} minutes` : `${m} minutes ago`;
      }
      if (abs < 86400) {
        const h = Math.round(abs / 3600);
        return diff >= 0 ? `in ${h} hours` : `${h} hours ago`;
      }
      const days = Math.round(abs / 86400);
      return diff >= 0 ? `in ${days} days` : `${days} days ago`;
    }
    return shortDateTime();
  }

  let activeTimestampTooltip = null;

  function removeTimestampTooltip() {
    if (!activeTimestampTooltip) return;
    const element = activeTimestampTooltip;
    activeTimestampTooltip = null;
    element.style.opacity = '0';
    element.addEventListener('transitionend', () => element.remove(), { once: true });
  }

  function showTimestampTooltip(target, text) {
    if (!target || !text) return;
    removeTimestampTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'server-tooltip server-tooltip--timestamp';
    tooltip.textContent = text;
    tooltip.style.position = 'absolute';
    tooltip.style.opacity = '0';
    document.body.appendChild(tooltip);

    const rect = target.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    let top = rect.top - tooltipHeight - 8;
    if (top < 8) top = rect.bottom + 8;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    void tooltip.offsetWidth;
    tooltip.style.opacity = '1';

    activeTimestampTooltip = tooltip;
  }

  if (!window.__breadcordTimestampTooltipScrollBound) {
    window.addEventListener('scroll', removeTimestampTooltip, true);
    window.__breadcordTimestampTooltipScrollBound = true;
  }

  function attachTimestampTooltip(element, iso) {
    if (!element) return;
    const date = toDate(iso);
    if (!date) return;
    const isoString = date.toISOString();
    const tooltipText = formatTooltipDate(date);

    element.setAttribute('datetime', isoString);
    element.dataset.timestampTooltip = tooltipText;

    if (element.__breadcordTimestampTooltipBound) {
      return;
    }

    const handleEnter = () => showTimestampTooltip(element, element.dataset.timestampTooltip);
    const handleLeave = () => removeTimestampTooltip();

    element.addEventListener('mouseenter', handleEnter);
    element.addEventListener('mouseleave', handleLeave);
    element.addEventListener('focus', handleEnter);
    element.addEventListener('blur', handleLeave);

    element.__breadcordTimestampTooltipBound = true;
  }

  const DISCORD_MESSAGE_URL_RE = /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/i;
  const DISCORD_CHANNEL_URL_RE = /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/?$/i;
  const TOKEN_RE = /<(a?:[a-zA-Z0-9_]+:\d+)>|<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|@everyone|@here|https?:\/\/[^\s]+/g;

  const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;

  function extractYouTubeId(url = '') {
    if (!url) return null;
    try {
      const parsed = new URL(url, 'https://youtube.com');
      const host = (parsed.hostname || '').replace(/^www\./, '').toLowerCase();
      if (host === 'youtu.be') {
        const id = parsed.pathname.replace(/^\//, '');
        return id ? id.split(/[/?#&]/)[0] : null;
      }
      if (host.endsWith('youtube.com')) {
        if (parsed.searchParams.has('v')) {
          return parsed.searchParams.get('v');
        }
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts.length) {
          const [first, second] = pathParts;
          if ((first === 'embed' || first === 'shorts') && second) return second;
        }
      }
    } catch (e) {
      const match = YOUTUBE_RE.exec(url);
      if (match) return match[1];
      return null;
    }
    const match = YOUTUBE_RE.exec(url);
    return match ? match[1] : null;
  }

  function normalizeId(id) {
    if (id == null) return null;
    if (typeof id === 'string') return id;
    try {
      return String(id);
    } catch (err) {
      return null;
    }
  }

  function addIdToSet(target, value) {
    const id = normalizeId(value?.id ?? value?.user?.id ?? value);
    if (id) target.add(id);
  }

  function collectMentionedUserIds(message) {
    const ids = new Set();
    if (!message) return ids;
    const sources = [message.mentions, message.mention_users, message.user_mentions];
    sources.forEach(source => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach(item => addIdToSet(ids, item));
      } else if (typeof source === 'object') {
        Object.values(source).forEach(item => addIdToSet(ids, item));
      }
    });
    const mentionUserIds = message.mention_user_ids || message.mentionUserIds;
    if (Array.isArray(mentionUserIds)) {
      mentionUserIds.forEach(id => addIdToSet(ids, id));
    }
    return ids;
  }

  function collectMentionedRoleIds(message) {
    const ids = new Set();
    if (!message) return ids;
    const sources = [message.mention_roles, message.mentionRoles, message.role_mentions, message.mentioned_roles];
    sources.forEach(source => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach(roleId => {
          const normalized = normalizeId(roleId?.id ?? roleId);
          if (normalized) ids.add(normalized);
        });
      } else if (typeof source === 'object') {
        Object.values(source).forEach(roleId => {
          const normalized = normalizeId(roleId?.id ?? roleId);
          if (normalized) ids.add(normalized);
        });
      }
    });
    return ids;
  }

  function collectRolesFromMember(member, targetId) {
    const roleIds = new Set();
    if (!member) return roleIds;
    const memberId = normalizeId(member.user?.id ?? member.id);
    if (!memberId || memberId !== targetId) return roleIds;
    const roleSources = [member.roles, member.role_ids, member.roleIds];
    roleSources.forEach(source => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach(roleId => {
          const normalized = normalizeId(roleId);
          if (normalized) roleIds.add(normalized);
        });
      }
    });
    return roleIds;
  }

  function collectRolesFromGuild(guild, currentUserId) {
    const roles = new Set();
    if (!guild || !currentUserId) return roles;
    const targetId = normalizeId(currentUserId);
    if (!targetId) return roles;

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

    ['member', 'self_member', 'me', 'current_member'].forEach(key => {
      if (guild[key]) inspectMember(guild[key]);
    });

    return roles;
  }

  function resolveClanBadgeInfo(message, author, member, options) {
    const candidates = [];

    const pushCandidate = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(pushCandidate);
        return;
      }
      if (typeof value === 'object') {
        candidates.push(value);
      }
    };

    const messageCandidate = message?.primary_guild ?? message?.primaryGuild ?? message?.clan_badge ?? message?.clanBadge;
    pushCandidate(messageCandidate);

    const authorCandidates = [
      author?.primary_guild,
      author?.primaryGuild,
      author?.clan,
      author?.clan_badge,
      author?.clanBadge
    ];
    authorCandidates.forEach(pushCandidate);

    const memberCandidates = [
      member?.primary_guild,
      member?.primaryGuild,
      member?.clan,
      member?.clan_badge,
      member?.clanBadge
    ];
    memberCandidates.forEach(pushCandidate);

    const optionCandidates = [
      options?.primary_guild,
      options?.primaryGuild
    ];
    optionCandidates.forEach(pushCandidate);

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate.identity_enabled === false) continue;

      const guildId = normalizeId(
        candidate.identity_guild_id ??
        candidate.guild_id ??
        candidate.guildId ??
        candidate.id
      );

      const badgeHash = candidate.badge ?? candidate.badge_hash ?? candidate.badgeHash ?? candidate.asset ?? candidate.asset_id ?? candidate.assetId;
      const explicitUrl = candidate.badge_url ?? candidate.badgeUrl ?? candidate.icon_url ?? candidate.iconUrl ?? candidate.image_url ?? candidate.imageUrl;
      const tag = safeText(candidate.tag ?? candidate.name ?? candidate.text ?? candidate.label).trim();

      if (!tag) continue;

      let badgeUrl = explicitUrl;
      if (!badgeUrl && guildId && badgeHash) {
        badgeUrl = `https://cdn.discordapp.com/clan-badges/${guildId}/${badgeHash}.png?size=16`;
      }

      if (!badgeUrl) continue;

      const backgroundColor = normalizeRoleColorValue(
        candidate.badge_color ??
        candidate.color ??
        candidate.primary_color ??
        candidate.background_color ??
        candidate.backgroundColor ??
        candidate.tint
      );

      return {
        tag,
        url: badgeUrl,
        guildId: guildId || null,
        badgeHash: badgeHash || null,
        backgroundColor: backgroundColor || null
      };
    }

    return null;
  }

  function createClanBadgeElement(info) {
    if (!info || !info.url || !info.tag) return null;
    const badge = el('span', 'breadcord-message__clan-badge');
    badge.dataset.clanBadge = 'true';
    if (info.guildId) badge.dataset.guildId = info.guildId;
    if (info.badgeHash) badge.dataset.badgeHash = info.badgeHash;
    if (info.backgroundColor) {
      badge.style.setProperty('--clan-badge-bg', info.backgroundColor);
    }
    badge.title = info.tag;

    const icon = document.createElement('img');
    icon.className = 'breadcord-message__clan-badge-icon';
    icon.src = info.url;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.width = 16;
    icon.height = 16;
    icon.loading = 'lazy';
    badge.appendChild(icon);

    const text = el('span', 'breadcord-message__clan-badge-text', info.tag);
    badge.appendChild(text);

    return badge;
  }

function normalizeRoleColorValue(color) {
  if (color == null) return null;

  const toHex = (numeric) => {
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const raw = Math.round(numeric).toString(16);
    const trimmed = raw.length > 6 ? raw.slice(-6) : raw.padStart(6, '0');
    return `#${trimmed}`;
  };

  if (typeof color === 'number') {
    return toHex(color);
  }

  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (!trimmed || trimmed === '0') return null;
    if (/^#/i.test(trimmed)) {
      const hex = trimmed.replace(/#/g, '');
      if (/^[0-9a-f]{8}$/i.test(hex)) {
        return `#${hex.slice(-6).toLowerCase()}`;
      }
      if (/^[0-9a-f]{3}$/i.test(hex)) {
        const expanded = hex.split('').map(ch => ch + ch).join('');
        return `#${expanded.toLowerCase()}`;
      }
      if (/^[0-9a-f]{6}$/i.test(hex)) {
        return `#${hex.toLowerCase()}`;
      }
      return null;
    }
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      return toHex(Number.parseInt(trimmed, 16));
    }
    if (/^[0-9]+$/.test(trimmed)) {
      return toHex(Number(trimmed));
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
    const normalized = normalizeRoleColorValue(value);
    if (normalized && !colors.includes(normalized)) {
      colors.push(normalized);
    }
  };

  if (Array.isArray(source)) {
    source.forEach(pushColor);
  }

  const processObject = (obj) => {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach(pushColor);
      return;
    }
    const preferredKeys = [
      'primary_color', 'primaryColor',
      'secondary_color', 'secondaryColor',
      'tertiary_color', 'tertiaryColor',
      'quaternary_color', 'quaternaryColor'
    ];
    preferredKeys.forEach((key) => pushColor(obj[key]));
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

function applyAuthorNameDecorations(authorNameEl, author = {}) {
  if (!authorNameEl || !author) return;
  const gradientColors = Array.isArray(author.roleGradient) && author.roleGradient.length >= 2
    ? author.roleGradient
    : null;

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
    if (author.roleColor) {
      authorNameEl.style.color = author.roleColor;
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

function resolveRoleFromGuild(guild, roleId) {
  if (!guild || !roleId) return null;
  const normalizedId = normalizeId(roleId);
  if (!normalizedId) return null;
  const { roles } = guild || {};
  if (!roles) return null;

  const matchId = (candidate) => normalizeId(candidate?.id) === normalizedId;

  if (Array.isArray(roles)) {
    return roles.find(matchId) || null;
  }

  if (typeof roles === 'object') {
    if (typeof roles.get === 'function') {
      const fromMap = roles.get(normalizedId);
      if (fromMap) return fromMap;
    }
    if (normalizedId in roles) {
      const direct = roles[normalizedId];
      if (direct) return direct;
    }
    if (typeof roles.values === 'function') {
      for (const value of roles.values()) {
        if (matchId(value)) return value;
      }
    }
    if (typeof roles.forEach === 'function') {
      let resolved = null;
      roles.forEach((value) => {
        if (resolved) return;
        if (matchId(value)) resolved = value;
      });
      if (resolved) return resolved;
    }
    const values = Object.values(roles);
    for (const value of values) {
      if (matchId(value)) return value;
    }
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
    }
  };

  collect(member?.roles);
  collect(member?.role_ids);
  collect(member?.roleIds);

  let highestRole = null;
  let highestPosition = -Infinity;
  let highestGradient = null;
  let highestGradientPosition = -Infinity;

  roleIds.forEach(roleId => {
    const role = resolveRoleFromGuild(guild, roleId);
    if (!role) return;
    const position = resolveRolePosition(role);
    if (position > highestPosition) {
      highestPosition = position;
      highestRole = role;
    }
    if (position >= highestGradientPosition) {
      const gradientColors = extractRoleGradientColors(role);
      if (gradientColors && gradientColors.length >= 2) {
        highestGradient = {
          role,
          gradientColors
        };
        highestGradientPosition = position;
      }
    }
  });

  const meta = {};

  if (highestRole) {
    const color = normalizeRoleColorValue(highestRole.color ?? highestRole.colour ?? highestRole.hexColor ?? highestRole.hex_color);
    if (color) meta.color = color;
    const iconUrl = buildRoleIconUrl(highestRole);
    if (iconUrl) meta.iconUrl = iconUrl;
    const emoji = highestRole.unicodeEmoji || highestRole.unicode_emoji || highestRole.emoji;
    if (emoji) meta.iconEmoji = emoji;
  }

  if (highestGradient) {
    meta.gradientColors = highestGradient.gradientColors.slice();
    meta.color = meta.gradientColors[0];
  }

  if (!meta.color) {
    const fallbackColorCandidates = [
      member?.color,
      member?.colour,
      member?.hexColor,
      member?.hex_color,
      member?.roleColor,
      member?.role_color,
      member?.user?.accentColor,
      member?.user?.accent_color
    ];

    for (const candidate of fallbackColorCandidates) {
      const normalized = normalizeRoleColorValue(candidate);
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
      meta.color = memberGradient[0];
    }
  }

  return Object.keys(meta).length ? meta : null;
}

function resolveMessageAuthorRoleMeta(message, options = {}) {
  if (!message || typeof message !== 'object') return null;
  const { author = {}, member = {} } = message;

  const meta = {};
  const directColorCandidates = [author.roleColor, author.role_color, author.color, author.colour, author.hexColor, author.hex_color, author.accentColor, author.accent_color, message.authorColor, message.author_color, member.color, member.colour, member.hexColor, member.hex_color, member.roleColor, member.role_color, member.user?.accentColor, member.user?.accent_color];

  for (const candidate of directColorCandidates) {
    const normalized = normalizeRoleColorValue(candidate);
    if (normalized) {
      meta.color = normalized;
      break;
    }
  }

  const applyGradientCandidate = (candidate) => {
    if (meta.gradientColors || candidate == null) return;
    if (Array.isArray(candidate)) {
      const normalizedArray = candidate
        .map(value => normalizeRoleColorValue(value))
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);
      if (normalizedArray.length >= 2) {
        meta.gradientColors = normalizedArray;
          meta.color = normalizedArray[0];
      }
      return;
    }
    if (typeof candidate === 'object') {
      const gradient = extractRoleGradientColors(candidate);
      if (gradient) {
        meta.gradientColors = gradient;
          meta.color = gradient[0];
      }
    }
  };

  const gradientCandidates = [
    author.roleGradient,
    author.role_gradient,
    author.roleGradients,
    author.role_gradients,
    author.roleColorGradient,
    author.role_color_gradient,
    author.roleColors,
    author.role_colors,
    author.colors,
    author.color_gradient,
    author.colorGradient,
    message.authorGradient,
    message.author_gradient,
    message.roleGradient,
    message.role_gradient,
    member.roleGradient,
    member.role_gradient,
    member.roleGradients,
    member.role_gradients,
    member.roleColors,
    member.role_colors,
    member.colors,
    member.colorGradient,
    member.color_gradient
  ];

  gradientCandidates.forEach(applyGradientCandidate);

  if (author.roleIconUrl || author.roleIconEmoji || author.role_icon_url || author.role_icon_emoji) {
    if (author.roleIconUrl || author.role_icon_url) meta.iconUrl = author.roleIconUrl || author.role_icon_url;
    if (author.roleIconEmoji || author.role_icon_emoji) meta.iconEmoji = author.roleIconEmoji || author.role_icon_emoji;
  }

  let guild = options.guild || null;
  if (!guild) {
    const guildId = normalizeId(message.guild_id || message.guildId);
    if (guildId && typeof window?.BreadCache?.getGuild === 'function') {
      try {
        guild = window.BreadCache.getGuild(guildId) || guild;
      } catch (err) {
        guild = guild || null;
      }
    }
  }

  const roleInfo = resolveMemberHighestRoleInfo(member, guild);
  if (roleInfo) {
    if (!meta.color && roleInfo.color) meta.color = roleInfo.color;
    if (!meta.iconUrl && roleInfo.iconUrl) meta.iconUrl = roleInfo.iconUrl;
    if (!meta.iconUrl && !meta.iconEmoji && roleInfo.iconEmoji) meta.iconEmoji = roleInfo.iconEmoji;
    if (roleInfo.gradientColors) {
      if (!meta.gradientColors) {
        meta.gradientColors = roleInfo.gradientColors.slice();
      }
      meta.color = meta.gradientColors[0];
    }
  }

  if (!meta.color) {
    const fallbackCandidates = [
      author?.defaultColor,
      author?.default_color,
      message?.color,
      message?.colour
    ];

    for (const candidate of fallbackCandidates) {
      const normalized = normalizeRoleColorValue(candidate);
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
      if (!meta.color) meta.color = memberGradient[0];
    }
  }

  return Object.keys(meta).length ? meta : null;
}

function resolveMessageAuthorColor(message, options = {}) {
  const meta = resolveMessageAuthorRoleMeta(message, options);
  if (!meta) return null;
  if (meta.color) return meta.color;
  if (Array.isArray(meta.gradientColors) && meta.gradientColors.length) {
    return meta.gradientColors[0];
  }
  return null;
}

  function resolveCurrentUserId(options = {}) {
    const fromOptions = normalizeId(options.currentUserId);
    if (fromOptions) return fromOptions;
    try {
      if (typeof window.BreadCache?.getCurrentUser === 'function') {
        const current = window.BreadCache.getCurrentUser();
        const normalized = normalizeId(current?.id);
        if (normalized) return normalized;
      }
    } catch (err) {
      // ignore cache failures
    }
    return normalizeId(window.BreadCache?.user?.id);
  }

  function resolveCurrentUserRoles(options = {}, guildId = null, currentUserId = null) {
    const roles = new Set();
    if (Array.isArray(options.currentUserRoles)) {
      options.currentUserRoles.forEach(roleId => {
        const normalized = normalizeId(roleId);
        if (normalized) roles.add(normalized);
      });
    }
    if (!currentUserId) {
      return Array.from(roles);
    }

    const inspectGuild = (guild) => {
      if (!guild) return;
      const guildRoles = collectRolesFromGuild(guild, currentUserId);
      guildRoles.forEach(roleId => roles.add(roleId));
    };

    if (options.guild) inspectGuild(options.guild);

    if (guildId && typeof window?.BreadCache?.getGuild === 'function') {
      try {
        const cached = window.BreadCache.getGuild(guildId);
        if (cached && cached !== options.guild) inspectGuild(cached);
      } catch (err) {
        // ignore guild lookup failures
      }
    }

    return Array.from(roles);
  }

  function messageMentionsCurrentUser(message, options = {}) {
    if (!message) return false;
    const currentUserId = resolveCurrentUserId(options);
    if (!currentUserId) return false;

    if (message.mention_everyone || message.mentionEveryone) return true;

    if (typeof message.content === 'string') {
      if (/(^|\s)@everyone\b/i.test(message.content) || /(^|\s)@here\b/i.test(message.content)) {
        return true;
      }
    }

    const mentionedUsers = collectMentionedUserIds(message);
    if (mentionedUsers.has(currentUserId)) return true;

    const mentionedRoles = collectMentionedRoleIds(message);
    if (mentionedRoles.size) {
      const guildId = normalizeId(message.guild_id || message.guildId || options.guild?.id);
      const currentRoles = resolveCurrentUserRoles(options, guildId, currentUserId);
      for (const roleId of currentRoles) {
        if (mentionedRoles.has(roleId)) return true;
      }
    }

    return false;
  }

  function ensureCdnAssetUrl(path, { size = 96, passthrough = true } = {}) {
    if (!path) return null;
    let resolved = path;
    const hasProtocol = /^https?:/i.test(resolved);
    const startsWithSlash = typeof resolved === 'string' && resolved.startsWith('/');
    if (!hasProtocol) {
      resolved = `https://cdn.discordapp.com${startsWithSlash ? '' : '/'}${resolved}`;
    }
    try {
      const url = new URL(resolved);
      if (size && !url.searchParams.has('size')) {
        url.searchParams.set('size', String(size));
      }
      if (passthrough && !url.searchParams.has('passthrough')) {
        url.searchParams.set('passthrough', 'true');
      }
      return url.toString();
    } catch (err) {
      return null;
    }
  }

  function buildAvatarDecorationUrl(decoration, authorId, size = 96) {
    if (!decoration) return null;
    if (typeof decoration === 'string') {
      let path = decoration;
      if (!/^https?:/i.test(path)) {
        if (!path.startsWith('avatar-') && !path.startsWith('/avatar-')) {
          path = `/avatar-decoration-presets/${path}`;
        }
        if (!path.endsWith('.png') && !path.includes('.')) {
          path = `${path}.png`;
        }
      }
      return ensureCdnAssetUrl(path, { size });
    }
    if (typeof decoration === 'object') {
      if (decoration.asset_url) {
        return ensureCdnAssetUrl(decoration.asset_url, { size });
      }
      if (decoration.asset) {
        return ensureCdnAssetUrl(`/avatar-decoration-presets/${decoration.asset}.png`, { size });
      }
      if (decoration.asset_path) {
        return ensureCdnAssetUrl(decoration.asset_path, { size });
      }
      if (decoration.url) {
        return ensureCdnAssetUrl(decoration.url, { size });
      }
      if (decoration.id && authorId) {
        return ensureCdnAssetUrl(`/avatar-decorations/${authorId}/${decoration.id}.png`, { size });
      }
    }
    return null;
  }

  function resolveAvatarDecorationUrl(message, author, member, options = {}) {
    const candidates = [];
    const collect = (source) => {
      if (!source) return;
      candidates.push(source.avatar_decoration_data);
      candidates.push(source.avatarDecorationData);
      candidates.push(source.avatar_decoration);
      candidates.push(source.avatarDecoration);
      candidates.push(source.avatar_decoration_asset);
      candidates.push(source.avatarDecorationAsset);
      candidates.push(source.avatar_decoration_url);
      candidates.push(source.avatarDecorationUrl);
    };

    collect(author);
    collect(member);
    collect(message);
    if (options && options.authorDecoration) {
      candidates.push(options.authorDecoration);
    }

    if ((!candidates.some(Boolean)) && author?.id && typeof window?.BreadCache?.getUser === 'function') {
      try {
        const cached = window.BreadCache.getUser(author.id);
        collect(cached);
      } catch (err) {
        /* ignore cache lookup errors */
      }
    }

    const decoration = candidates.find(Boolean);
    if (!decoration) return null;
    return buildAvatarDecorationUrl(decoration, author?.id);
  }

  const AVATAR_VALUE_KEYS = [
    'avatarURL',
    'avatarUrl',
    'avatar_url',
    'avatar',
    'guildAvatar',
    'guild_avatar',
    'profilePhoto',
    'profile_photo',
    'displayAvatarURL',
    'displayAvatarUrl'
  ];

  const AVATAR_PROXY_KEYS = [
    'avatarProxyURL',
    'avatarProxyUrl',
    'avatar_proxy_url',
    'avatarProxy',
    'avatar_proxy',
    'proxyAvatarUrl',
    'proxy_avatar_url'
  ];

  function extractAvatarCandidateValue(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'function') {
      try {
        const maybe = value();
        return typeof maybe === 'string' ? maybe : null;
      } catch (err) {
        return null;
      }
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const extracted = extractAvatarCandidateValue(entry);
        if (extracted) return extracted;
      }
      return null;
    }
    if (typeof value === 'object') {
      if (typeof value.url === 'string') return value.url;
      if (typeof value.proxy_url === 'string') return value.proxy_url;
      if (typeof value.default === 'string') return value.default;
      if (typeof value.href === 'string') return value.href;
      if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        try {
          const maybe = value.toString();
          if (typeof maybe === 'string' && maybe !== '[object Object]') return maybe;
        } catch (err) {
          /* ignore */
        }
      }
    }
    return null;
  }

  function buildAvatarUrl(candidate, userId, size = 96) {
    if (!candidate) return null;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    if (/^data:/i.test(trimmed)) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) {
      return ensureCdnAssetUrl(trimmed, { size, passthrough: false });
    }
    if (trimmed.startsWith('//')) {
      return ensureCdnAssetUrl(`https:${trimmed}`, { size, passthrough: false });
    }
    if (trimmed.startsWith('cdn.discordapp.com')) {
      return ensureCdnAssetUrl(`https://${trimmed}`, { size, passthrough: false });
    }
    if (trimmed.startsWith('/')) {
      return ensureCdnAssetUrl(trimmed, { size, passthrough: false });
    }
    if (trimmed.startsWith('avatars/')) {
      return ensureCdnAssetUrl(`/${trimmed}`, { size, passthrough: false });
    }
    if (/^[a-zA-Z0-9_]+$/.test(trimmed) && userId) {
      const format = trimmed.startsWith('a_') ? 'gif' : 'png';
      return ensureCdnAssetUrl(`/avatars/${userId}/${trimmed}.${format}`, { size, passthrough: false });
    }
    if (userId && /\.(?:png|jpe?g|gif|webp)$/i.test(trimmed)) {
      return ensureCdnAssetUrl(`/avatars/${userId}/${trimmed}`, { size, passthrough: false });
    }
    return null;
  }

  function resolveDefaultAvatarUrl(author, member, fallbackId) {
    const size = 96;
    const candidateSources = [author, member, member?.user];
    for (const source of candidateSources) {
      if (!source) continue;
      const direct = extractAvatarCandidateValue(source.defaultAvatar || source.default_avatar || source.avatarDefault || source.avatar_default);
      if (direct) {
        const resolved = buildAvatarUrl(direct, normalizeId(source.id || source.user_id || source.userId), size);
        if (resolved) return resolved;
      }
    }

    const discriminatorCandidates = [
      author?.discriminator,
      author?.discrim,
      member?.discriminator,
      member?.user?.discriminator
    ];
    for (const disc of discriminatorCandidates) {
      if (typeof disc === 'string' && disc.length) {
        const parsed = Number.parseInt(disc, 10);
        if (!Number.isNaN(parsed)) {
          const index = ((parsed % 5) + 5) % 5;
          return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
        }
      }
    }

    if (fallbackId) {
      try {
        const asBigInt = BigInt(fallbackId);
        const index = Number(asBigInt % 5n);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
      } catch (err) {
        /* ignore */
      }
    }

    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }

  function resolveAvatarImageUrl(message, author, member, options = {}) {
    const size = Number.isFinite(options.avatarSize) ? options.avatarSize : 96;
    const fallbackId = normalizeId(author?.id) || normalizeId(member?.user?.id) || normalizeId(member?.id) || normalizeId(message?.author?.id);
    const urls = [];

    const pushCandidate = (value, idHint) => {
      const extracted = extractAvatarCandidateValue(value);
      if (!extracted) return;
      const resolved = buildAvatarUrl(extracted, normalizeId(idHint) || fallbackId, size);
      if (resolved) urls.push(resolved);
    };

    const collectSource = (source) => {
      if (!source) return;
      const sourceId = normalizeId(source.id || source.user_id || source.userId || source.user?.id);
      for (const key of AVATAR_VALUE_KEYS) {
        if (key in source) {
          const value = typeof source[key] === 'function' ? (() => {
            try { return source[key]({ size }); } catch (err) { return null; }
          })() : source[key];
          pushCandidate(value, sourceId);
        }
      }
      for (const key of AVATAR_PROXY_KEYS) {
        if (key in source) {
          pushCandidate(source[key], sourceId);
        }
      }
      if (typeof source.getAvatarURL === 'function') {
        try {
          pushCandidate(source.getAvatarURL({ size, format: 'png' }), sourceId);
        } catch (err) {
          /* ignore */
        }
      }
      if (source.user && source.user !== source) {
        collectSource(source.user);
      }
    };

    if (options && options.avatarUrl) pushCandidate(options.avatarUrl, fallbackId);
    if (options && options.authorAvatar) pushCandidate(options.authorAvatar, fallbackId);

    if (message) {
      pushCandidate(message.authorAvatarUrl, fallbackId);
      pushCandidate(message.author_avatar_url, fallbackId);
      pushCandidate(message.authorAvatar, fallbackId);
      pushCandidate(message.author_avatar, fallbackId);
    }

    collectSource(author);
    collectSource(member);
    collectSource(message?.author);

    if (!urls.length && author?.id && typeof window?.BreadCache?.getUser === 'function') {
      try {
        const cached = window.BreadCache.getUser(author.id);
        collectSource(cached);
      } catch (err) {
        /* ignore */
      }
    }

    const unique = urls.filter((url, index) => urls.indexOf(url) === index);
    if (unique.length) {
      return { url: unique[0], isFallback: false };
    }

    return { url: resolveDefaultAvatarUrl(author, member, fallbackId), isFallback: true };
  }

  const APPLICATION_COMMAND_TYPES = {
    CHAT_INPUT: 1,
    USER: 2,
    MESSAGE: 3,
  };

  const APPLICATION_COMMAND_OPTION_TYPES = {
    SUB_COMMAND: 1,
    SUB_COMMAND_GROUP: 2,
  };

  function toNumber(value) {
    if (value == null) return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  function truncateText(value, max = 80) {
    if (value == null) return null;
    const str = String(value);
    if (str.length <= max) return str;
    if (max <= 3) return '...';
    return `${str.slice(0, max - 3)}...`;
  }

  function coalesceInteractionObject(message) {
    if (!message) return null;
    const candidates = [
      message.interaction,
      message.interaction_data,
      message.interactionData,
      message.interaction_metadata,
      message.interactionMetadata,
      message.application_command,
      message.applicationCommand,
    ];

    let merged = null;
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      if (!merged) merged = {};
      for (const [key, value] of Object.entries(candidate)) {
        if (value === undefined) continue;
        merged[key] = value;
      }
    }
    return merged;
  }

  function extractInteractionResolvedData(interaction) {
    const resolved = {
      users: undefined,
      members: undefined,
      roles: undefined,
      channels: undefined,
      messages: undefined,
      attachments: undefined,
    };

    const candidates = [
      interaction?.resolved,
      interaction?.data?.resolved,
      interaction?.resolved_objects,
      interaction?.resolvedObjects,
      interaction?.resolved_data,
      interaction?.resolvedData,
      interaction?.command?.resolved,
      interaction?.command?.resolved_objects,
    ];

    for (const source of candidates) {
      if (!source || typeof source !== 'object') continue;
      for (const key of Object.keys(resolved)) {
        if (resolved[key] == null && source[key] != null) {
          resolved[key] = source[key];
        }
      }
    }

    return resolved;
  }

  function collectCommandPathParts(options) {
    if (!Array.isArray(options)) return [];
    for (const option of options) {
      if (!option || typeof option !== 'object') continue;
      const optionType = toNumber(option.type ?? option.option_type ?? option.kind);
      if (
        optionType === APPLICATION_COMMAND_OPTION_TYPES.SUB_COMMAND ||
        optionType === APPLICATION_COMMAND_OPTION_TYPES.SUB_COMMAND_GROUP
      ) {
        const name = typeof option.name === 'string' ? option.name : null;
        const inner = collectCommandPathParts(option.options || []);
        const parts = [];
        if (name) parts.push(name);
        return parts.concat(inner);
      }
    }
    return [];
  }

  function collectSlashCommandOptions(options, resolved, out = []) {
    if (!Array.isArray(options)) return out;
    for (const option of options) {
      if (!option || typeof option !== 'object') continue;
      const optionType = toNumber(option.type ?? option.option_type ?? option.kind);
      if (
        optionType === APPLICATION_COMMAND_OPTION_TYPES.SUB_COMMAND ||
        optionType === APPLICATION_COMMAND_OPTION_TYPES.SUB_COMMAND_GROUP
      ) {
        collectSlashCommandOptions(option.options || [], resolved, out);
        continue;
      }
      const formatted = formatSlashOption(option, resolved);
      if (formatted) out.push(formatted);
    }
    return out;
  }

  function formatSlashOption(option, resolved) {
    if (!option || typeof option !== 'object') return null;
    const name = typeof option.name === 'string' ? option.name : null;
    if (!name) return null;
    const optionType = toNumber(option.type ?? option.option_type ?? option.kind);
    const valueText = formatSlashOptionValue(optionType, option, resolved);
    if (valueText == null) return null;
    return { name, value: valueText };
  }

  function formatSlashOptionValue(optionType, option, resolved) {
    if (
      optionType === APPLICATION_COMMAND_OPTION_TYPES.SUB_COMMAND ||
      optionType === APPLICATION_COMMAND_OPTION_TYPES.SUB_COMMAND_GROUP
    ) {
      return null;
    }

    let rawValue;
    if (option && typeof option === 'object') {
      if ('value' in option) {
        rawValue = option.value;
      } else if ('values' in option && Array.isArray(option.values) && option.values.length) {
        rawValue = option.values[0];
      } else if ('target_id' in option) {
        rawValue = option.target_id;
      } else if ('targetId' in option) {
        rawValue = option.targetId;
      } else if ('id' in option) {
        rawValue = option.id;
      }
    }

    if (rawValue === undefined) return null;

    switch (optionType) {
      case 3: { // STRING
        return truncateText(rawValue, 80);
      }
      case 4: // INTEGER
      case 10: { // NUMBER
        return String(rawValue);
      }
      case 5: { // BOOLEAN
        return rawValue ? 'true' : 'false';
      }
      case 6: { // USER
        const entity =
          lookupResolvedEntity(resolved?.users, rawValue) ||
          lookupResolvedEntity(resolved?.members, rawValue);
        const display = resolveUserDisplayName(entity) || resolveUserNameFromCache(normalizeId(rawValue));
        if (display) return `@${display}`;
        const id = normalizeId(rawValue);
        return id ? `<@${id}>` : null;
      }
      case 7: { // CHANNEL
        const entity = lookupResolvedEntity(resolved?.channels, rawValue);
        const name = entity?.name || entity?.channel?.name;
        if (name) return `#${name}`;
        const id = normalizeId(rawValue);
        return id ? `<#${id}>` : null;
      }
      case 8: { // ROLE
        const entity = lookupResolvedEntity(resolved?.roles, rawValue);
        const name = entity?.name;
        if (name) return `@${name}`;
        const id = normalizeId(rawValue);
        return id ? `<@&${id}>` : null;
      }
      case 9: { // MENTIONABLE
        const roleEntity = lookupResolvedEntity(resolved?.roles, rawValue);
        if (roleEntity) {
          const name = roleEntity?.name;
          return name ? `@${name}` : (normalizeId(rawValue) ? `<@&${normalizeId(rawValue)}>` : null);
        }
        const userEntity =
          lookupResolvedEntity(resolved?.users, rawValue) ||
          lookupResolvedEntity(resolved?.members, rawValue);
        if (userEntity) {
          const display = resolveUserDisplayName(userEntity) || resolveUserNameFromCache(normalizeId(rawValue));
          if (display) return `@${display}`;
          const id = normalizeId(rawValue);
          return id ? `<@${id}>` : null;
        }
        return normalizeId(rawValue) || null;
      }
      case 11: { // ATTACHMENT
        const entity = lookupResolvedEntity(resolved?.attachments, rawValue);
        const name = entity?.filename || entity?.name;
        if (name) return truncateText(name, 80);
        const id = normalizeId(rawValue);
        return truncateText(id ? `attachment ${id}` : String(rawValue), 80);
      }
      default: {
        if (rawValue == null) return null;
        if (typeof rawValue === 'string') return truncateText(rawValue, 80);
        if (typeof rawValue === 'number' || typeof rawValue === 'bigint') return String(rawValue);
        if (typeof rawValue === 'boolean') return rawValue ? 'true' : 'false';
        try {
          return truncateText(JSON.stringify(rawValue), 80);
        } catch (err) {
          return truncateText(String(rawValue), 80);
        }
      }
    }
  }

  function lookupResolvedEntity(collection, targetId) {
    if (!collection || targetId == null) return null;
    const normalized = normalizeId(targetId);
    if (!normalized) return null;

    if (Array.isArray(collection)) {
      return collection.find(item => normalizeId(item?.id || item?.user?.id) === normalized) || null;
    }

    if (collection instanceof Map) {
      return collection.get(normalized) || collection.get(targetId) || null;
    }

    if (typeof collection === 'object') {
      if (collection[normalized]) return collection[normalized];
      if (collection[targetId]) return collection[targetId];
      for (const value of Object.values(collection)) {
        if (normalizeId(value?.id || value?.user?.id) === normalized) {
          return value;
        }
      }
    }

    return null;
  }

  function resolveUserDisplayName(user) {
    if (!user || typeof user !== 'object') return null;
    const sources = [];
    sources.push(user);
    if (user.user && typeof user.user === 'object') sources.push(user.user);
    if (user.member && typeof user.member === 'object') sources.push(user.member);

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const candidates = [
        source.global_name,
        source.globalName,
        source.display_name,
        source.displayName,
        source.nick,
        source.nickname,
        source.username,
        source.user?.username,
        source.name,
        source.tag,
      ];
      for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      }
    }
    return null;
  }

  function resolveUserNameFromCache(id) {
    const normalized = normalizeId(id);
    if (!normalized) return null;
    if (typeof window === 'undefined' || !window.BreadCache) return null;
    try {
      if (typeof window.BreadCache.getUser === 'function') {
        const cached = window.BreadCache.getUser(normalized);
        return resolveUserDisplayName(cached);
      }
    } catch (err) {
      /* ignore cache errors */
    }
    return null;
  }

  function resolveInteractionInvoker(interaction, message, options = {}) {
    const candidates = [];
    const pushCandidate = (value) => {
      if (!value || typeof value !== 'object') return;
      candidates.push(value);
    };

    pushCandidate(options?.interactionUser);
    pushCandidate(options?.invoker);
    pushCandidate(message?.interaction_user);
    pushCandidate(message?.interactionUser);
    pushCandidate(message?.interaction?.user);
    pushCandidate(message?.author);
    pushCandidate(interaction?.user);
    pushCandidate(interaction?.member?.user);
    pushCandidate(interaction?.member);
    pushCandidate(interaction?.triggering_user);
    pushCandidate(interaction?.triggeringUser);
    pushCandidate(interaction?.triggering_member);
    pushCandidate(interaction?.triggeringMember);

    const seen = new Set();
    for (const candidate of candidates) {
      const candidateId = normalizeId(candidate?.id || candidate?.user_id || candidate?.userId || candidate?.user?.id);
      const display = resolveUserDisplayName(candidate) || resolveUserNameFromCache(candidateId);
      if (candidateId) {
        if (seen.has(candidateId) && !display) continue;
        seen.add(candidateId);
      }
      if (display || candidateId) {
        return { id: candidateId || null, name: display || (candidateId ? `User ${candidateId}` : null), raw: candidate };
      }
    }

    return null;
  }

  function resolveSlashCommandDisplayData(message, options = {}) {
    const interaction = coalesceInteractionObject(message);
    if (!interaction) return null;

    const commandTypeCandidates = [
      interaction.command_type,
      interaction.commandType,
      interaction.application_command_type,
      interaction.applicationCommandType,
      interaction.data?.type,
      interaction.command?.type,
    ];

    let normalizedCommandType = null;
    for (const candidate of commandTypeCandidates) {
      const numeric = toNumber(candidate);
      if (numeric != null) {
        normalizedCommandType = numeric;
        break;
      }
    }

    const interactionType = toNumber(interaction.type ?? interaction.interaction_type ?? interaction.interactionType);
    if (normalizedCommandType == null && interactionType === 2) {
      normalizedCommandType = APPLICATION_COMMAND_TYPES.CHAT_INPUT;
    }

    if (
      normalizedCommandType != null &&
      normalizedCommandType !== APPLICATION_COMMAND_TYPES.CHAT_INPUT
    ) {
      return null; // only render slash commands for now
    }

    const nameCandidates = [
      interaction.command_name,
      interaction.commandName,
      interaction.name,
      interaction.data?.name,
      interaction.command?.name,
    ];
    const baseName = nameCandidates.find(name => typeof name === 'string' && name.trim());
    if (!baseName) return null;

    const normalizedBase = safeText(baseName).replace(/^\//, '').trim();
    if (!normalizedBase) return null;

    const optionsCandidates = [];
    if (Array.isArray(interaction.options)) optionsCandidates.push(interaction.options);
    if (Array.isArray(interaction.data?.options)) optionsCandidates.push(interaction.data.options);
    if (Array.isArray(interaction.command_options)) optionsCandidates.push(interaction.command_options);
    if (Array.isArray(interaction.commandOptions)) optionsCandidates.push(interaction.commandOptions);
    if (Array.isArray(interaction.command?.options)) optionsCandidates.push(interaction.command.options);
    if (Array.isArray(interaction.application_command?.options)) optionsCandidates.push(interaction.application_command.options);

    const optionsArray = optionsCandidates.find(arr => Array.isArray(arr) && arr.length) || optionsCandidates[0] || [];

    const subPathParts = collectCommandPathParts(optionsArray);
    const commandPath = [normalizedBase]
      .concat(subPathParts.map(part => safeText(part).trim()).filter(Boolean))
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!commandPath) return null;

    const resolved = extractInteractionResolvedData(interaction);
    const optionEntries = collectSlashCommandOptions(optionsArray, resolved, []);

    const invoker = resolveInteractionInvoker(interaction, message, options);

    return {
      commandType: normalizedCommandType ?? APPLICATION_COMMAND_TYPES.CHAT_INPUT,
      commandPath,
      commandText: `/${commandPath}`,
      options: optionEntries,
      invokerId: invoker?.id || null,
      invokerName: invoker?.name || null,
      interaction,
    };
  }

  function renderInteractionPill(info) {
    if (!info || !info.commandText) return null;

    const container = el('div', 'breadcord-message__interaction');
    if (info.commandType != null) {
      container.dataset.commandType = String(info.commandType);
    }
    if (info.invokerId) {
      container.dataset.invokerId = info.invokerId;
    }

    const iconEl = el('span', 'breadcord-message__interaction-icon', '/');
    container.appendChild(iconEl);

    const textWrapper = el('div', 'breadcord-message__interaction-text');
    const actorName = info.invokerName && info.invokerName.trim() ? info.invokerName.trim() : 'Unknown User';
    const actorEl = el('span', 'breadcord-message__interaction-user', actorName);
    textWrapper.appendChild(actorEl);
    textWrapper.appendChild(document.createTextNode(' used '));
    const commandEl = el('span', 'breadcord-message__interaction-command', info.commandText);
    textWrapper.appendChild(commandEl);

    if (Array.isArray(info.options) && info.options.length) {
      const optionsWrapper = el('div', 'breadcord-message__interaction-options');
      for (const option of info.options) {
        const optionEl = el('span', 'breadcord-message__interaction-option');
        const nameEl = el('span', 'breadcord-message__interaction-option-name', option.name);
        optionEl.appendChild(nameEl);
        if (option.value != null) {
          optionEl.appendChild(document.createTextNode(': '));
          const valueEl = el('span', 'breadcord-message__interaction-option-value', String(option.value));
          optionEl.appendChild(valueEl);
        }
        optionsWrapper.appendChild(optionEl);
      }
      textWrapper.appendChild(optionsWrapper);
    }

    container.appendChild(textWrapper);
    return container;
  }

  const INLINE_PATTERNS = [
    { open: '**', close: '**', create: () => el('strong'), allowNesting: true },
    { open: '__', close: '__', create: () => el('span', 'breadcord-underline'), allowNesting: true },
    { open: '~~', close: '~~', create: () => el('del'), allowNesting: true },
    { open: '`', close: '`', create: () => el('code', 'breadcord-inline-code'), allowNesting: false },
    { open: '*', close: '*', create: () => el('em'), allowNesting: true },
    { open: '_', close: '_', create: () => el('em'), allowNesting: true }
  ];

  function findNextInlinePattern(str, start) {
    let candidate = null;
    for (const pattern of INLINE_PATTERNS) {
      const pos = str.indexOf(pattern.open, start);
      if (pos === -1) continue;
      if (!candidate || pos < candidate.pos || (pos === candidate.pos && pattern.open.length > candidate.pattern.open.length)) {
        candidate = { pos, pattern };
      }
    }
    return candidate;
  }

  function findClosingForPattern(str, pattern, from) {
    return str.indexOf(pattern.close, from);
  }

  function registerPlaceholder(placeholders, value) {
    const id = placeholders.length;
    placeholders.push(value);
    return ` ${id} `;
  }

  function processInlineEscapes(str, placeholders) {
    if (!str) return '';
    let result = '';
    let index = 0;
    while (index < str.length) {
      const ch = str[index];
      if (ch === '\\') {
        if (index + 1 >= str.length) {
          result += '\\';
          index += 1;
          continue;
        }
        const next = str[index + 1];
        if ((next === '*' || next === '_' || next === '~') && (index + 2) < str.length && str[index + 2] === next) {
          result += registerPlaceholder(placeholders, next + next);
          index += 3;
          continue;
        }
        result += registerPlaceholder(placeholders, next);
        index += 2;
        continue;
      }
      result += ch;
      index += 1;
    }
    return result;
  }

  function normalizeAngleBracketLinks(str) {
    if (!str) return '';
    return str.replace(/<((?:https?:\/\/)[^>\s]+)>/gi, '$1');
  }

  function restorePlaceholders(str, placeholders) {
    if (!str) return '';
    let result = '';
    let index = 0;
    while (index < str.length) {
      const next = str.indexOf('\u0000', index);
      if (next === -1) {
        result += str.slice(index);
        break;
      }
      if (next > index) {
        result += str.slice(index, next);
      }
      const end = str.indexOf('\u0000', next + 1);
      if (end === -1) {
        result += str.slice(next);
        break;
      }
      const id = Number(str.slice(next + 1, end));
      if (!Number.isNaN(id) && placeholders[id] != null) {
        result += placeholders[id];
      } else {
        result += str.slice(next, end + 1);
      }
      index = end + 1;
    }
    return result;
  }

  function appendTokenNode(parent, token, context = {}) {
    if (!token) return;

    if (token.startsWith('<') && token.includes(':')) {
      const em = /<(a?):([a-zA-Z0-9_]+):(\d+)>/.exec(token);
      if (em) {
        const isAnim = Boolean(em[1]);
        const name = em[2];
        const id = em[3];
        const img = el('img', 'breadcord-emoji');
        img.alt = `:${name}:`;
        img.src = `https://cdn.discordapp.com/emojis/${id}.${isAnim ? 'gif' : 'png'}`;
        img.width = 20;
        img.height = 20;
        parent.appendChild(img);
        return;
      }
    }

    const um = /<@!?(\d+)>/.exec(token);
    if (um) {
      const id = um[1];
      let name = `@${id}`;
      try {
        if (window.BreadCache && typeof window.BreadCache.getUser === 'function') {
          const u = window.BreadCache.getUser(id);
          if (u) {
            name = u.global_name || u.displayName || u.username || `@${id}`;
          } else if (typeof window.BreadCache.fetchUser === 'function') {
            const a = el('a', 'mention mention-user', name);
            a.href = '#';
            a.dataset.userId = id;
            // If previous child is a text node that contains the markdown bracket
            // (for example when tokenization left '[test](' as text), remove that
            // bracketed portion so the anchor replaces it cleanly.
            try {
              const last = parent.lastChild;
              if (last && last.nodeType === 3) {
                const txt = last.textContent || '';
                const bracketSeq = `[${label}](`;
                const idx = txt.lastIndexOf(bracketSeq);
                if (idx !== -1) {
                  last.textContent = txt.slice(0, idx);
                } else if (txt.endsWith('(')) {
                  // remove a trailing '(' if present
                  last.textContent = txt.slice(0, -1);
                }
              }
            } catch (e) {/* ignore */}

            parent.appendChild(a);
            window.BreadCache.fetchUser(id).then(fetched => {
              if (fetched) {
                a.textContent = fetched.global_name || fetched.displayName || fetched.username || `@${id}`;
              }
            }).catch(() => {});
            return;
          }
        }
      } catch (e) {
        /* ignore */
      }
      const a = el('a', 'mention mention-user', name);
      a.href = '#';
      a.dataset.userId = id;
      parent.appendChild(a);
      return;
    }

    const rm = /<@&(\d+)>/.exec(token);
    if (rm) {
      const id = rm[1];
      let name = `@&${id}`;
      try {
        if (window.BreadCache && typeof window.BreadCache.getGuild === 'function') {
          for (const g of (window.BreadCache.guilds || [])) {
            if (g && Array.isArray(g.roles)) {
              const r = g.roles.find(rr => String(rr.id) === String(id));
              if (r) { name = `@${r.name}`; break; }
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
      const span = el('span', 'mention mention-role', name);
      span.dataset.roleId = id;
      parent.appendChild(span);
      return;
    }

    const cm = /<#(\d+)>/.exec(token);
    if (cm) {
      const id = cm[1];
      let name = `#${id}`;
      try {
        if (window.BreadCache && typeof window.BreadCache.getGuild === 'function') {
          for (const g of (window.BreadCache.guilds || [])) {
            if (g && Array.isArray(g.channels)) {
              const c = g.channels.find(cc => String(cc.id) === String(id));
              if (c) { name = `#${c.name}`; break; }
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
      const a = el('a', 'mention mention-channel', name);
      a.href = '#';
      a.dataset.channelId = id;
      parent.appendChild(a);
      return;
    }

    if (token === '@everyone' || token === '@here') {
      parent.appendChild(el('span', 'mention mention-everyone', token));
      return;
    }

    if (/^https?:\/\//.test(token)) {
      let normalizedUrl = token;
      if (normalizedUrl.startsWith('<') && normalizedUrl.endsWith('>')) {
        normalizedUrl = normalizedUrl.slice(1, -1);
      } else if (!normalizedUrl.startsWith('<') && normalizedUrl.endsWith('>') && !normalizedUrl.includes('<')) {
        normalizedUrl = normalizedUrl.slice(0, -1);
      }
      const videoId = context.hasYouTubeEmbed ? null : extractYouTubeId(normalizedUrl);
      if (videoId) {
        parent.appendChild(createYouTubeEmbed(videoId));
        return;
      }
      const dm = DISCORD_MESSAGE_URL_RE.exec(normalizedUrl);
      if (dm) {
        let label = `Message ${dm[3]}`;
        try {
          if (window.BreadCache && typeof window.BreadCache.getGuild === 'function') {
            const guildId = dm[1];
            const channelId = dm[2];
            const guild = window.BreadCache.getGuild(guildId);
            if (guild && Array.isArray(guild.channels)) {
              const ch = guild.channels.find(cc => String(cc.id) === String(channelId));
              if (ch) label = `#${ch.name} – ${dm[3]}`;
            }
          }
        } catch (e) {
          /* ignore */
        }
        const a = el('a', 'mention mention-link mention-message', label);
        a.href = normalizedUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.dataset.guildId = dm[1];
        a.dataset.channelId = dm[2];
        a.dataset.messageId = dm[3];
        parent.appendChild(a);
        return;
      }
      const a = el('a', null, normalizedUrl);
      a.href = normalizedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parent.appendChild(a);
      return;
    }

    parent.appendChild(document.createTextNode(token));
  }

  function appendPlainTextSegment(segment, parent, placeholders, context) {
    if (!segment) return;

    // Scan through the segment and handle placeholders (\u0000id\u0000),
    // and discord timestamp tokens <t:...>.
    let i = 0;
    while (i < segment.length) {
      const ch = segment[i];

      // Placeholder marker
      if (ch === '\u0000') {
        const end = segment.indexOf('\u0000', i + 1);
        if (end === -1) {
          // invalid marker, append rest as text
          parent.appendChild(document.createTextNode(segment.slice(i)));
          break;
        }
        const id = Number(segment.slice(i + 1, end));
        if (!Number.isNaN(id) && placeholders[id] != null) {
          appendTokenNode(parent, placeholders[id], context);
        } else {
          parent.appendChild(document.createTextNode(segment.slice(i, end + 1)));
        }
        i = end + 1;
        continue;
      }

      // Timestamp token: <t:1697040000> or <t:1697040000:f>
      if (ch === '<' && segment[i + 1] === 't') {
        const rest = segment.slice(i);
        const tm = /^<t:(\d+)(?::([tTdDfFR]))?>/.exec(rest);
        if (tm) {
          const seconds = Number(tm[1]);
          const fmt = tm[2] || 'f';
          const date = new Date(seconds * 1000);
          const span = el('span', 'breadcord-timestamp');
          span.textContent = formatDiscordTimestamp(date, fmt);
          // attach tooltip with full date
          try { attachTimestampTooltip(span, date.toISOString()); } catch (e) {}
          parent.appendChild(span);
          i += tm[0].length;
          continue;
        }
      }

      // Default: consume until next special char to reduce DOM churn
      let nextSpecial = segment.length;
      const nextPlaceholder = segment.indexOf('\u0000', i);
      if (nextPlaceholder !== -1) nextSpecial = Math.min(nextSpecial, nextPlaceholder);
      const nextBracket = segment.indexOf('[', i + 1);
      if (nextBracket !== -1) nextSpecial = Math.min(nextSpecial, nextBracket);
      const nextTimestamp = segment.indexOf('<t:', i + 1);
      if (nextTimestamp !== -1) nextSpecial = Math.min(nextSpecial, nextTimestamp);
      // append the slice
      if (nextSpecial === i) nextSpecial = i + 1; // avoid infinite loop
      parent.appendChild(document.createTextNode(segment.slice(i, nextSpecial)));
      i = nextSpecial;
    }
    return;
  }

  function appendMarkdownLink(parent, label, normalizedUrl, placeholders, context) {
    const doc = parent?.ownerDocument || document;
    const a = doc.createElement('a');
    a.href = normalizedUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    try {
      const dm = DISCORD_MESSAGE_URL_RE.exec(normalizedUrl);
      if (dm) {
        let labelText = `Message ${dm[3]}`;
        try {
          if (window.BreadCache && typeof window.BreadCache.getGuild === 'function') {
            const guildId = dm[1];
            const channelId = dm[2];
            const guild = window.BreadCache.getGuild(guildId);
            if (guild && Array.isArray(guild.channels)) {
              const ch = guild.channels.find(cc => String(cc.id) === String(channelId));
              if (ch) labelText = `#${ch.name} – ${dm[3]}`;
            }
          }
        } catch (e) {/* ignore */}
        a.className = 'mention mention-link mention-message';
        a.dataset.guildId = dm[1];
        a.dataset.channelId = dm[2];
        a.dataset.messageId = dm[3];
        if (label === normalizedUrl) {
          parseInlineNodes(labelText, a, placeholders, context);
        } else {
          parseInlineNodes(label, a, placeholders, context);
        }
        return a;
      }
      const chm = DISCORD_CHANNEL_URL_RE.exec(normalizedUrl);
      if (chm) {
        a.className = 'mention mention-channel';
        a.dataset.channelId = chm[2];
      }
    } catch (err) {
      /* ignore */
    }

    parseInlineNodes(label, a, placeholders, context);
    return a;
  }

  function normalizeMarkdownUrl(raw) {
    let normalizedUrl = raw;
    if (normalizedUrl.startsWith('<') && normalizedUrl.endsWith('>')) {
      normalizedUrl = normalizedUrl.slice(1, -1);
    } else if (!normalizedUrl.startsWith('<') && normalizedUrl.endsWith('>') && !normalizedUrl.includes('<')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }
    return normalizedUrl;
  }

  function tryParseMarkdownLink(str, startIndex, parent, placeholders, context) {
    if (str.charAt(startIndex) !== '[') return null;
    const labelEnd = str.indexOf(']', startIndex + 1);
    if (labelEnd === -1 || str.charAt(labelEnd + 1) !== '(') return null;
    const label = str.slice(startIndex + 1, labelEnd);
    const urlStart = labelEnd + 2;
    if (urlStart >= str.length) return null;

    let url = null;
    let endIndex = -1;

    if (str.charAt(urlStart) === '\u0000') {
      const markerEnd = str.indexOf('\u0000', urlStart + 1);
      if (markerEnd === -1) return null;
      const id = Number(str.slice(urlStart + 1, markerEnd));
      if (Number.isNaN(id)) return null;
      const placeholderValue = placeholders[id];
      if (placeholderValue == null) return null;
      url = placeholderValue;
      if (str.charAt(markerEnd + 1) === ')') {
        endIndex = markerEnd + 2;
      } else if (typeof url === 'string' && url.endsWith(')')) {
        url = url.slice(0, -1);
        endIndex = markerEnd + 1;
      } else {
        return null;
      }
      placeholders[id] = null;
    } else {
      const close = str.indexOf(')', urlStart);
      if (close === -1) return null;
      url = str.slice(urlStart, close);
      endIndex = close + 1;
    }

    if (!url) return null;
    const normalizedUrl = normalizeMarkdownUrl(url);
    const anchor = appendMarkdownLink(parent, label, normalizedUrl, placeholders, context);
    parent.appendChild(anchor);
    return endIndex;
  }

  function parseInlineNodes(str, parent, placeholders, context) {
    let index = 0;
    while (index < str.length) {
      if (str.charAt(index) === '[') {
        const newIndex = tryParseMarkdownLink(str, index, parent, placeholders, context);
        if (newIndex != null) {
          index = newIndex;
          continue;
        }
      }
      const placeholderIndex = str.indexOf('\u0000', index);
      const patternInfo = findNextInlinePattern(str, index);
      let nextIndex = str.length;
      if (patternInfo) nextIndex = Math.min(nextIndex, patternInfo.pos);
      if (placeholderIndex !== -1) nextIndex = Math.min(nextIndex, placeholderIndex);
      if (nextIndex > index) {
        appendPlainTextSegment(str.slice(index, nextIndex), parent, placeholders, context);
        index = nextIndex;
        continue;
      }
      if (placeholderIndex !== -1 && placeholderIndex === index) {
        const end = str.indexOf('\u0000', index + 1);
        if (end === -1) {
          appendPlainTextSegment(str.slice(index), parent, placeholders, context);
          break;
        }
        const id = Number(str.slice(index + 1, end));
        if (!Number.isNaN(id) && placeholders[id] != null) {
          appendTokenNode(parent, placeholders[id], context);
        } else {
          appendPlainTextSegment(str.slice(index, end + 1), parent, placeholders, context);
        }
        index = end + 1;
        continue;
      }
      if (patternInfo && patternInfo.pos === index) {
        const { pattern } = patternInfo;
        const closeIndex = findClosingForPattern(str, pattern, index + pattern.open.length);
        if (closeIndex === -1) {
          appendPlainTextSegment(pattern.open, parent, placeholders, context);
          index += pattern.open.length;
          continue;
        }
        const inner = str.slice(index + pattern.open.length, closeIndex);
        const node = pattern.create();
        if (pattern.allowNesting === false) {
          node.textContent = restorePlaceholders(inner, placeholders);
        } else {
          parseInlineNodes(inner, node, placeholders, context);
        }
        parent.appendChild(node);
        index = closeIndex + pattern.close.length;
        continue;
      }
      parent.appendChild(document.createTextNode(str.charAt(index)));
      index += 1;
    }
  }

  function renderInlineContent(text, context = {}) {
    const fragment = document.createDocumentFragment();
    if (!text) return fragment;
    const placeholders = [];
    const escapedSource = processInlineEscapes(safeText(text), placeholders);
    const source = normalizeAngleBracketLinks(escapedSource);
    let result = '';
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let match;
    while ((match = TOKEN_RE.exec(source)) !== null) {
      const start = match.index;
      if (start > last) result += source.slice(last, start);
      result += `\u0000${placeholders.length}\u0000`;
      placeholders.push(match[0]);
      last = start + match[0].length;
    }
    if (last < source.length) result += source.slice(last);
    parseInlineNodes(result, fragment, placeholders, context);
    return fragment;
  }

  function calculateListLevel(indent) {
    if (!Number.isFinite(indent) || indent <= 0) return 0;
    return Math.floor((indent - 1) / 2) + 1;
  }

  function renderMarkdownBlocks(container, text, context = {}) {
  const lines = safeText(text).split(/\n/);
  const listStack = [];
  let currentParagraph = null;

    const finalizeParagraph = () => {
      if (!currentParagraph) return;
      container.appendChild(currentParagraph);
      currentParagraph = null;
    };

    const clearListStack = () => {
      listStack.length = 0;
    };

    const ensureList = (level) => {
      while (listStack.length > level + 1) {
        listStack.pop();
      }
      while (listStack.length <= level) {
        const newList = el('ul', 'breadcord-md-list');
        if (listStack.length === 0) {
          container.appendChild(newList);
        } else {
          const parentEntry = listStack[listStack.length - 1];
          const parentLi = parentEntry.ul.lastElementChild;
          if (parentLi) {
            parentLi.appendChild(newList);
          } else {
            container.appendChild(newList);
          }
        }
        listStack.push({ ul: newList });
      }
      return listStack[level].ul;
    };

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed.length) {
        finalizeParagraph();
        clearListStack();
        continue;
      }

      const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
      if (headingMatch) {
  finalizeParagraph();
  clearListStack();
        const level = headingMatch[1].length;
        const heading = el('div', `breadcord-md-heading breadcord-md-heading--h${level}`);
        heading.appendChild(renderInlineContent(headingMatch[2].trim(), context));
        container.appendChild(heading);
        continue;
      }

      const subtextMatch = /^-#\s+(.*)$/.exec(trimmed);
      if (subtextMatch) {
        finalizeParagraph();
        clearListStack();
        const subtext = el('div', 'breadcord-md-subtext');
        subtext.appendChild(renderInlineContent(subtextMatch[1], context));
        container.appendChild(subtext);
        continue;
      }

      const blockquoteMatch = /^\s*>\s?(.*)$/.exec(rawLine);
      if (blockquoteMatch) {
        finalizeParagraph();
        clearListStack();
        const blockLines = [];
        let offset = i;
        while (offset < lines.length) {
          const nestedMatch = /^\s*>\s?(.*)$/.exec(lines[offset]);
          if (!nestedMatch) break;
          blockLines.push(nestedMatch[1]);
          offset += 1;
        }
        const blockquoteEl = el('blockquote', 'breadcord-md-blockquote');
        const fragment = document.createDocumentFragment();
        renderMarkdownBlocks(fragment, blockLines.join('\n'), context);
        while (fragment.firstChild) {
          const child = fragment.firstChild;
          fragment.removeChild(child);
          if (child.nodeType === 1 && child.classList) {
            if (child.classList.contains('breadcord-md-paragraph') || child.classList.contains('breadcord-md-subtext')) {
              child.classList.add('breadcord-md-blockquote-line');
            } else if (child.classList.contains('breadcord-md-list')) {
              child.classList.add('breadcord-md-blockquote-list');
            }
          }
          blockquoteEl.appendChild(child);
        }
        container.appendChild(blockquoteEl);
        i = offset - 1;
        continue;
      }

      const listMatch = /^(\s*)([-*])\s+(.*)$/.exec(rawLine);
      if (listMatch) {
        finalizeParagraph();
        const indent = listMatch[1].replace(/\t/g, '    ').length;
        const level = calculateListLevel(indent);
        const list = ensureList(level);
        const li = el('li', 'breadcord-md-list-item');
        li.appendChild(renderInlineContent(listMatch[3], context));
        list.appendChild(li);
        continue;
      }

      clearListStack();

      if (!currentParagraph) {
        currentParagraph = el('div', 'breadcord-md-paragraph');
      } else {
        currentParagraph.appendChild(document.createElement('br'));
      }
      currentParagraph.appendChild(renderInlineContent(rawLine, context));
    }

    finalizeParagraph();
  }

  function buildContentElement(content, embeds = []) {
    const container = el('div', 'breadcord-message__content');
    if (!content) return container;
    const context = {
      hasYouTubeEmbed: Array.isArray(embeds) && embeds.some(isYouTubeEmbed)
    };
    renderMarkdownBlocks(container, content, context);
    return container;
  }

  let youtubeApiPromise = null;

  function createYouTubeEmbed(videoId) {
    const wrap = el('div', 'breadcord-youtube-embed');
    wrap.dataset.videoId = videoId;
    wrap.dataset.thumbSrc = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    populateYouTubeThumbnail(wrap);
    return wrap;
  }

  function populateYouTubeThumbnail(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove('is-playing');
    wrapper.dataset.playing = 'false';
    wrapper.innerHTML = '';
    const img = el('img');
    img.src = wrapper.dataset.thumbSrc;
    img.alt = `YouTube video ${wrapper.dataset.videoId}`;
    wrapper.appendChild(img);
    const playBtn = el('div', 'play-btn');
    wrapper.appendChild(playBtn);
    wrapper.onclick = () => playYouTubeInline(wrapper);
  }

  function ensureYouTubeAPI() {
    if (window.YT && typeof window.YT.Player === 'function') {
      return Promise.resolve(window.YT);
    }
    if (!youtubeApiPromise) {
      youtubeApiPromise = new Promise((resolve, reject) => {
        const scriptId = 'breadcord-youtube-api';
        if (!document.getElementById(scriptId)) {
          const tag = document.createElement('script');
          tag.id = scriptId;
          tag.src = 'https://www.youtube.com/iframe_api';
          tag.async = true;
          tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
          document.head.appendChild(tag);
        }
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function onYTReady() {
          if (typeof previous === 'function') {
            try { previous(); } catch (err) { console.error('[breadcord_messagerenderer] Previous YT ready callback failed', err); }
          }
          if (window.YT && typeof window.YT.Player === 'function') {
            resolve(window.YT);
          } else {
            reject(new Error('YouTube API ready but YT.Player is unavailable'));
          }
        };
      }).catch(err => {
        youtubeApiPromise = null;
        throw err;
      });
    }
    return youtubeApiPromise;
  }

  function playYouTubeInline(wrapper) {
    if (!wrapper || wrapper.dataset.playing === 'true') return;
    wrapper.dataset.playing = 'true';
    wrapper.classList.add('is-playing');
    wrapper.onclick = null;
    ensureYouTubeAPI().then(YT => {
      wrapper.innerHTML = '';
      const container = el('div');
      container.style.width = '100%';
      container.style.height = '100%';
      wrapper.appendChild(container);
      const player = new YT.Player(container, {
        videoId: wrapper.dataset.videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (event) => {
            try { event.target.playVideo(); } catch (e) { /* ignore */ }
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              destroyYouTubePlayer(wrapper, player);
            }
          },
          onError: () => {
            destroyYouTubePlayer(wrapper, player);
          }
        }
      });
      wrapper._ytPlayer = player;
    }).catch(err => {
      console.error('[breadcord_messagerenderer] Failed to initialise YouTube player', err);
      populateYouTubeThumbnail(wrapper);
    });
  }

  function destroyYouTubePlayer(wrapper, player) {
    if (player && typeof player.destroy === 'function') {
      try { player.destroy(); } catch (e) { /* ignore */ }
    }
    wrapper._ytPlayer = null;
    populateYouTubeThumbnail(wrapper);
  }

  function renderAttachments(attachments = []) {
    if (!attachments || !attachments.length) return null;
    const wrap = el('div', 'breadcord-message__attachment-list');
    attachments.forEach(att => {
      if (!att) return;
      const item = el('div', 'breadcord-message__attachment');
      const url = att.url || att.proxy_url || '';
      const contentType = att.content_type || '';
      const filename = att.filename || '';
      
      // Check for image
      const isImage = /(png|jpe?g|gif|webp)$/i.test(url) || contentType.startsWith('image');
      // Check for video
      const isVideo = /(mp4|webm|mov|avi|mkv)$/i.test(url) || contentType.startsWith('video');
      // Check for audio
      const isAudio = /(mp3|wav|ogg|m4a|flac|aac)$/i.test(url) || contentType.startsWith('audio');
      
      if (isImage && url) {
        const img = el('img');
        img.src = url;
        img.loading = 'lazy';
        item.appendChild(img);
      } else if (isVideo && url) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        video.className = 'breadcord-message__attachment-video';
        item.appendChild(video);
      } else if (isAudio && url) {
        // Create custom audio player
        const audioPlayer = el('div', 'breadcord-audio-player');
        
        const audio = document.createElement('audio');
        audio.src = url;
        audio.preload = 'metadata';
        
        // Play/pause button
        const playBtn = el('button', 'breadcord-audio-player__play-btn');
        playBtn.type = 'button';
        playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
        playBtn.setAttribute('aria-label', 'Play');
        
        // Progress bar container
        const progressContainer = el('div', 'breadcord-audio-player__progress-container');
        const progressBar = el('div', 'breadcord-audio-player__progress-bar');
        const progressFill = el('div', 'breadcord-audio-player__progress-fill');
        progressBar.appendChild(progressFill);
        progressContainer.appendChild(progressBar);
        
        // Time display
        const timeDisplay = el('div', 'breadcord-audio-player__time');
        timeDisplay.textContent = '0:00 / 0:00';
        
        // Volume button
        const volumeBtn = el('button', 'breadcord-audio-player__volume-btn');
        volumeBtn.type = 'button';
        volumeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
        volumeBtn.setAttribute('aria-label', 'Volume');
        
        // Format time helper
        const formatTime = (seconds) => {
          if (!isFinite(seconds)) return '0:00';
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        
        // Play/pause functionality
        let isPlaying = false;
        playBtn.addEventListener('click', () => {
          if (isPlaying) {
            audio.pause();
          } else {
            audio.play();
          }
        });
        
        audio.addEventListener('play', () => {
          isPlaying = true;
          playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`;
          playBtn.setAttribute('aria-label', 'Pause');
        });
        
        audio.addEventListener('pause', () => {
          isPlaying = false;
          playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
          playBtn.setAttribute('aria-label', 'Play');
        });
        
        // Update progress and time
        audio.addEventListener('loadedmetadata', () => {
          timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
        });
        
        audio.addEventListener('timeupdate', () => {
          const progress = (audio.currentTime / audio.duration) * 100;
          progressFill.style.width = `${progress}%`;
          timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
        });
        
        // Seek functionality
        progressContainer.addEventListener('click', (e) => {
          const rect = progressBar.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          audio.currentTime = percent * audio.duration;
        });
        
        // Volume functionality
        let isMuted = false;
        volumeBtn.addEventListener('click', () => {
          isMuted = !isMuted;
          audio.muted = isMuted;
          if (isMuted) {
            volumeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
          } else {
            volumeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
          }
        });
        
        audioPlayer.appendChild(playBtn);
        audioPlayer.appendChild(progressContainer);
        audioPlayer.appendChild(timeDisplay);
        audioPlayer.appendChild(volumeBtn);
        item.appendChild(audioPlayer);
      }
      
      const link = el('a', null, filename || url || 'Attachment');
      link.href = url || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.appendChild(link);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function renderInlineMedia(mediaItems = []) {
    if (!Array.isArray(mediaItems) || !mediaItems.length) return null;
    const wrap = el('div', 'breadcord-inline-media');
    mediaItems.forEach(item => {
      if (!item || !item.url) return;
      if (item.kind === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true;
        video.loop = Boolean(item.loop);
        video.autoplay = Boolean(item.autoplay);
        video.muted = Boolean(item.muted);
        video.playsInline = true;
        video.className = 'breadcord-inline-media__video';
        if (item.width) video.width = item.width;
        if (item.height) video.height = item.height;
        wrap.appendChild(video);
        return;
      }
      const img = el('img', 'breadcord-inline-media__image');
      img.src = item.url;
      img.alt = '';
      if (item.width) img.width = item.width;
      if (item.height) img.height = item.height;
      if (item.loading) img.loading = item.loading;
      wrap.appendChild(img);
    });
    return wrap;
  }

  function isYouTubeEmbed(embed) {
    if (!embed || typeof embed !== 'object') return false;
    if (embed.provider?.name && embed.provider.name.toLowerCase() === 'youtube') return true;
    if (embed.url && extractYouTubeId(embed.url)) return true;
    if (embed.video?.url && extractYouTubeId(embed.video.url)) return true;
    return false;
  }

  function isTenorEmbed(embed) {
    if (!embed) return false;
    const providerName = embed.provider?.name?.toLowerCase?.() || '';
    if (providerName.includes('tenor')) return true;
    if (embed.url && /tenor\.com/i.test(embed.url)) return true;
    if (embed.video?.url && /tenor\.com/i.test(embed.video.url)) return true;
    return false;
  }

  function renderEmbeds(embeds = []) {
    if (!embeds || !embeds.length) return { embedList: null, inlineVideos: [], inlineMedia: [] };
    const list = el('div', 'breadcord-message__embed-list');
    const inlineVideos = [];
    const inlineMedia = [];
    embeds.forEach(embed => {
      if (isTenorEmbed(embed)) {
        const videoUrl = embed.video?.url || embed.url;
        if (videoUrl) {
          inlineVideos.push({ url: videoUrl, width: embed.video?.width, height: embed.video?.height });
        }
        return;
      }
      if (!embed) return;

      const hasStructuredContent = Boolean(
        (embed.author && embed.author.name) ||
        embed.title ||
        embed.description ||
        (Array.isArray(embed.fields) && embed.fields.some(field => field && (field.name || field.value))) ||
        (embed.footer && embed.footer.text)
      );

      const imageUrl = embed.image?.url;
      const thumbnailUrl = embed.thumbnail?.url;
      const preferThumbnail = !imageUrl && thumbnailUrl && (embed.type === 'image' || embed.type === 'thumbnail');
      if (!hasStructuredContent && (imageUrl || preferThumbnail)) {
        const source = imageUrl ? embed.image : embed.thumbnail;
        inlineMedia.push({
          kind: 'image',
          url: imageUrl || thumbnailUrl,
          width: source?.width,
          height: source?.height,
          loading: 'lazy'
        });
        return;
      }

      const root = el('div', 'breadcord-message__embed');
      if (embed.color) {
        root.style.setProperty('--embed-accent', `#${Number(embed.color).toString(16).padStart(6, '0')}`);
      }

      const embedHasYouTube = isYouTubeEmbed(embed);
      const embedInlineContext = { hasYouTubeEmbed: embedHasYouTube };

      const content = el('div', 'breadcord-message__embed-content');
      root.appendChild(content);

      if (embed.author?.name) {
        const authorEl = el('div', 'breadcord-message__embed-author');
        if (embed.author.icon_url) {
          const icon = el('img', 'breadcord-message__embed-author-icon');
          icon.src = embed.author.icon_url;
          authorEl.appendChild(icon);
        }
        const name = embed.author.url ? el('a', '') : el('span', '');
        if (embed.author.url) {
          name.href = embed.author.url;
          name.target = '_blank';
          name.rel = 'noopener noreferrer';
        }
        name.appendChild(renderInlineContent(embed.author.name, embedInlineContext));
        authorEl.appendChild(name);
        content.appendChild(authorEl);
      }

      if (embed.title) {
        const titleEl = embed.url ? el('a', 'breadcord-message__embed-title') : el('div', 'breadcord-message__embed-title');
        if (embed.url) {
          titleEl.href = embed.url;
          titleEl.target = '_blank';
          titleEl.rel = 'noopener noreferrer';
        }
        titleEl.appendChild(renderInlineContent(embed.title, embedInlineContext));
        content.appendChild(titleEl);
      }

      if (embed.description) {
        const descriptionEl = el('div', 'breadcord-message__embed-description');
        renderMarkdownBlocks(descriptionEl, embed.description, embedInlineContext);
        content.appendChild(descriptionEl);
      }

      const fields = Array.isArray(embed.fields) ? embed.fields : [];
      if (fields.length) {
        const fieldsWrap = el('div', 'breadcord-message__embed-fields');
        fields.forEach(field => {
          const fieldEl = el('div', `breadcord-message__embed-field${field.inline ? ' breadcord-message__embed-field--inline' : ''}`);
          if (field.name) {
            const nameEl = el('div', 'breadcord-message__embed-field-name');
            nameEl.appendChild(renderInlineContent(field.name, embedInlineContext));
            fieldEl.appendChild(nameEl);
          }
          if (field.value) {
            const valueEl = el('div', 'breadcord-message__embed-field-value');
            renderMarkdownBlocks(valueEl, field.value, embedInlineContext);
            fieldEl.appendChild(valueEl);
          }
          fieldsWrap.appendChild(fieldEl);
        });
        content.appendChild(fieldsWrap);
      }

  let mediaInserted = false;
  const videoId = embedHasYouTube ? (extractYouTubeId(embed.video?.url || embed.url || '') || (embed.video?.id ?? null)) : null;
      if (videoId) {
        const player = createYouTubeEmbed(videoId);
        root.appendChild(player);
        mediaInserted = true;
      } else if (embed.video?.url) {
        const video = document.createElement('video');
        video.src = embed.video.url;
        video.controls = true;
        video.className = 'breadcord-message__embed-video';
        if (embed.video.width) video.width = embed.video.width;
        if (embed.video.height) video.height = embed.video.height;
        root.appendChild(video);
        mediaInserted = true;
      }

      if (!mediaInserted && embed.image?.url) {
        const img = el('img', 'breadcord-message__embed-image');
        img.src = embed.image.url;
        img.alt = embed.image.proxy_url ? '' : (embed.title || '');
        if (embed.image.width) img.width = embed.image.width;
        if (embed.image.height) img.height = embed.image.height;
        root.appendChild(img);
        mediaInserted = true;
      }

      if (!mediaInserted && embed.thumbnail?.url) {
        const thumb = el('img', 'breadcord-message__embed-thumb');
        thumb.src = embed.thumbnail.url;
        thumb.alt = embed.thumbnail.description || embed.title || '';
        thumb.loading = 'lazy';
        if (embed.thumbnail.width) thumb.width = embed.thumbnail.width;
        if (embed.thumbnail.height) thumb.height = embed.thumbnail.height;
        root.classList.add('breadcord-message__embed--has-thumb');
        root.appendChild(thumb);
      }

      if (embed.footer?.text) {
        const footer = el('div', 'breadcord-message__embed-footer');
        if (embed.footer.icon_url) {
          const icon = el('img', 'breadcord-message__embed-footer-icon');
          icon.src = embed.footer.icon_url;
          footer.appendChild(icon);
        }
        const footerText = el('span');
        footerText.appendChild(renderInlineContent(embed.footer.text, embedInlineContext));
        footer.appendChild(footerText);
        if (embed.timestamp) {
          const embedTimestamp = el('time', 'breadcord-message__embed-footer-timestamp', fmtTs(embed.timestamp));
          attachTimestampTooltip(embedTimestamp, embed.timestamp);
          footer.appendChild(embedTimestamp);
        }
        content.appendChild(footer);
      }

      list.appendChild(root);
    });
    return { embedList: list.childElementCount ? list : null, inlineVideos, inlineMedia };
  }

  function renderReactions(reactions = []) {
    if (!reactions || !reactions.length) return null;
    const row = el('div', 'breadcord-message__reaction-row');
    reactions.forEach(r => { if (!r) return; const item = el('span', 'breadcord-message__reaction'); const emoji = r.emoji || {}; if (emoji.id) { const isAnim = Boolean(emoji.animated || (emoji.name && emoji.name.startsWith('a_'))); const img = el('img', 'breadcord-emoji breadcord-emoji--reaction'); img.src = `https://cdn.discordapp.com/emojis/${emoji.id}.${isAnim ? 'gif' : 'png'}`; item.appendChild(img); } else { item.appendChild(document.createTextNode(emoji.name || '')); } item.appendChild(el('span', 'breadcord-message__reaction-count', String(r.count || 0))); row.appendChild(item); });
    return row;
  }

  function renderMessage(message, options = {}) {
    ensureStylesheet();
    const root = el('article', 'breadcord-message');
    if (!message) return root;
    const compact = Boolean(options.compact);
    if (compact) {
      root.classList.add('breadcord-message--compact');
    }
    root.dataset.compact = compact ? 'true' : 'false';

    const messageId = normalizeId(message.id);
    if (messageId) root.dataset.messageId = messageId;

    const guildId = normalizeId(message.guild_id || message.guildId || options.guild?.id);
    if (guildId) root.dataset.guildId = guildId;

    const mentioned = messageMentionsCurrentUser(message, options);
    if (mentioned) {
      root.classList.add('breadcord-message--mentioned');
      root.dataset.mentioned = 'true';
    } else {
      root.dataset.mentioned = 'false';
    }

    const { author = {}, member = {}, content = '', attachments = [], embeds = [], reactions = [], timestamp, editedTimestamp } = message;
    const authorId = normalizeId(author.id);
    if (authorId) root.dataset.authorId = authorId;

    const resolvedAuthor = { ...author };
    const authorMeta = resolveMessageAuthorRoleMeta(message, options);
    if (!resolvedAuthor.roleColor && authorMeta?.color) {
      resolvedAuthor.roleColor = authorMeta.color;
    }
    if (!resolvedAuthor.roleIconUrl && authorMeta?.iconUrl) {
      resolvedAuthor.roleIconUrl = authorMeta.iconUrl;
    }
    if (!resolvedAuthor.roleIconUrl && !resolvedAuthor.roleIconEmoji && authorMeta?.iconEmoji) {
      resolvedAuthor.roleIconEmoji = authorMeta.iconEmoji;
    }
    if (!resolvedAuthor.roleGradient && Array.isArray(authorMeta?.gradientColors)) {
      resolvedAuthor.roleGradient = authorMeta.gradientColors.slice();
    }

    if (resolvedAuthor.roleColor) {
      root.dataset.authorColor = resolvedAuthor.roleColor;
    } else {
      delete root.dataset.authorColor;
    }

    if (Array.isArray(resolvedAuthor.roleGradient) && resolvedAuthor.roleGradient.length >= 2) {
      root.dataset.authorGradient = resolvedAuthor.roleGradient.join(',');
    } else {
      delete root.dataset.authorGradient;
    }

    if (resolvedAuthor.roleIconUrl) {
      root.dataset.roleIconUrl = resolvedAuthor.roleIconUrl;
    } else {
      delete root.dataset.roleIconUrl;
    }

    if (resolvedAuthor.roleIconEmoji) {
      root.dataset.roleIconEmoji = resolvedAuthor.roleIconEmoji;
    } else {
      delete root.dataset.roleIconEmoji;
    }

    const showAvatar = !compact && options.showAvatar !== false;
    const showHeader = showAvatar || options.showHeader === true;

    if (showAvatar) {
      const avatar = el('div', 'breadcord-message__avatar');
      const avatarInfo = resolveAvatarImageUrl(message, author, member, options);
      if (avatarInfo?.url) {
        avatar.style.backgroundImage = `url("${avatarInfo.url}")`;
        avatar.dataset.usesFallbackAvatar = avatarInfo.isFallback ? 'true' : 'false';
      }
      const decorationUrl = resolveAvatarDecorationUrl(message, author, member, options);
      if (decorationUrl) {
        const decorationImg = document.createElement('img');
        decorationImg.className = 'breadcord-message__avatar-decoration';
        decorationImg.src = decorationUrl;
        decorationImg.alt = '';
        decorationImg.setAttribute('aria-hidden', 'true');
        decorationImg.loading = 'lazy';
        avatar.appendChild(decorationImg);
      }
      root.appendChild(avatar);
    }
    const body = el('div', 'breadcord-message__body');
    if (compact) {
      body.classList.add('breadcord-message__body--compact');
    }
    if (showHeader) {
      const header = el('div', 'breadcord-message__header');
      const authorNameEl = el('span', 'breadcord-message__author', resolvedAuthor.displayName || resolvedAuthor.username || 'Unknown');
      applyAuthorNameDecorations(authorNameEl, resolvedAuthor);
      header.appendChild(authorNameEl);

      const clanBadgeInfo = resolveClanBadgeInfo(message, resolvedAuthor, member, options);
      const clanBadgeEl = clanBadgeInfo ? createClanBadgeElement(clanBadgeInfo) : null;

      if (resolvedAuthor.roleIconUrl || resolvedAuthor.roleIconEmoji) {
        let iconEl;
        if (resolvedAuthor.roleIconUrl) {
          iconEl = document.createElement('img');
          iconEl.className = 'breadcord-message__role-icon';
          iconEl.src = resolvedAuthor.roleIconUrl;
          iconEl.alt = '';
          iconEl.setAttribute('aria-hidden', 'true');
          iconEl.loading = 'lazy';
        } else {
          iconEl = document.createElement('span');
          iconEl.className = 'breadcord-message__role-icon breadcord-message__role-icon--emoji';
          iconEl.textContent = resolvedAuthor.roleIconEmoji;
          iconEl.setAttribute('aria-hidden', 'true');
        }
        header.appendChild(iconEl);
        if (clanBadgeEl && iconEl.parentNode === header) {
          header.insertBefore(clanBadgeEl, iconEl);
        } else if (clanBadgeEl) {
          header.appendChild(clanBadgeEl);
        }
      } else if (clanBadgeEl) {
        header.appendChild(clanBadgeEl);
      }
      if (timestamp) {
        const timestampEl = el('time', 'breadcord-message__timestamp', fmtTs(timestamp));
        attachTimestampTooltip(timestampEl, timestamp);
        header.appendChild(timestampEl);
      }
      if (editedTimestamp) header.appendChild(el('span', 'breadcord-message__edited-tag', '(edited)'));
      body.appendChild(header);
    } else {
      root.dataset.headerHidden = 'true';
    }
    const interactionInfo = resolveSlashCommandDisplayData(message, options);
    const interactionEl = interactionInfo ? renderInteractionPill(interactionInfo) : null;
    if (interactionEl) {
      body.appendChild(interactionEl);
      root.dataset.hasInteraction = 'true';
      if (interactionInfo.commandPath) {
        root.dataset.interactionCommand = interactionInfo.commandPath;
      } else {
        delete root.dataset.interactionCommand;
      }
      if (interactionInfo.commandType != null) {
        root.dataset.interactionCommandType = String(interactionInfo.commandType);
      } else {
        delete root.dataset.interactionCommandType;
      }
    } else {
      root.dataset.hasInteraction = 'false';
      delete root.dataset.interactionCommand;
      delete root.dataset.interactionCommandType;
    }
    body.appendChild(buildContentElement(content, embeds));
    const at = renderAttachments(attachments); if (at) body.appendChild(at);
    const { embedList, inlineVideos, inlineMedia } = renderEmbeds(embeds);
    const inlineMediaEl = renderInlineMedia(inlineMedia);
    if (inlineMediaEl) body.appendChild(inlineMediaEl);
    if (embedList) body.appendChild(embedList);
    if (inlineVideos.length) {
      inlineVideos.forEach(v => {
        const vid = document.createElement('video');
        vid.src = v.url;
        vid.autoplay = true;
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        vid.controls = false;
        vid.removeAttribute('controls');
        vid.setAttribute('disablepictureinpicture', '');
        vid.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
        vid.className = 'breadcord-inline-video';
        if (v.width) vid.width = v.width;
        if (v.height) vid.height = v.height;
        body.appendChild(vid);
      });
    }
    const rr = renderReactions(reactions); if (rr) body.appendChild(rr);
    root.appendChild(body); return root;
  }

  function createExampleMessage(overrides = {}) { const now = new Date(); return Object.assign({ id: `demo-${now.getTime()}`, author: { id: 'demo', username: 'BreadBot', displayName: 'Bread Bot', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' }, content: 'Hello from BreadcordMessageRenderer!\nThis is a sample message.', timestamp: now.toISOString(), attachments: [], embeds: [], reactions: [] }, overrides); }

  window.BreadcordMessageRenderer = Object.freeze({ renderMessage, renderAttachments, renderEmbeds, renderReactions, fmtTs, createExampleMessage });
  })();
