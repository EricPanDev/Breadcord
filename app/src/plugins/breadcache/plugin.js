// BreadCache
/**
 * BreadCache — store and retrieve objects by ID, with merge-on-update.
 * - Deep-merges plain objects when updating an existing entry.
 * - Arrays are REPLACED by default; set arrays: "concat" | "unique" to change.
 * - IDs are explicit (first arg), not inferred from the object.
 */
class ObjectCache {
  /**
   * @param {Object} [opts]
   * @param {"replace"|"concat"|"unique"} [opts.arrays="replace"] - array merge strategy
   * @param {boolean} [opts.clone=true] - clone values on set/get to avoid external mutation
   */
  constructor(opts = {}) {
    const { arrays = "replace", clone = true } = opts;
    this._map = new Map();
    this._arrayStrategy = arrays;
    this._clone = clone;
  }

  /** Get a value by ID. */
  get(id) {
    const v = this._map.get(id);
    return this._clone ? ObjectCache._clone(v) : v;
  }

  /** Check if an ID exists. */
  has(id) { return this._map.has(id); }

  /** Set/overwrite an ID with an object. */
  set(id, obj) {
    if (!ObjectCache._isObjectLike(obj)) {
      throw new TypeError("BreadCache.set expects a plain object value");
    }
    this._map.set(id, this._clone ? ObjectCache._clone(obj) : obj);
    return this;
  }

  /**
   * Update by ID: if it exists, deep-merge; otherwise create it.
   * @param {string|number} id
   * @param {Object} patch - partial object to merge
   */
  update(id, patch) {
    if (!ObjectCache._isObjectLike(patch)) {
      throw new TypeError("BreadCache.update expects a plain object patch");
    }
    const existing = this._map.get(id);
    if (!existing) {
      // create new
      this._map.set(id, this._clone ? ObjectCache._clone(patch) : { ...patch });
      return this.get(id);
    }
    const merged = ObjectCache._merge(existing, patch, this._arrayStrategy);
    this._map.set(id, merged);
    return this._clone ? ObjectCache._clone(merged) : merged;
  }

  /** Delete by ID. */
  delete(id) { return this._map.delete(id); }

  /** Remove everything. */
  clear() { this._map.clear(); }

  /** Size of the cache. */
  size() { return this._map.size; }

  /** Get all entries as [id, value] tuples. */
  entries() {
    return Array.from(this._map.entries())
      .map(([k, v]) => [k, this._clone ? ObjectCache._clone(v) : v]);
  }

  /** Get all values. */
  values() {
    return Array.from(this._map.values())
      .map(v => (this._clone ? ObjectCache._clone(v) : v));
  }

  // --- internals ---

  static _isObjectLike(v) {
    return v && Object.prototype.toString.call(v) === "[object Object]";
  }

  static _clone(v) {
    // cheap deep clone for JSON-safe objects
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  static _merge(target, patch, arrayStrategy = "replace") {
    // Mutates target in-place, returns target
    if (target === patch) return target;

    for (const key of Object.keys(patch)) {
      const a = target[key];
      const b = patch[key];

      if (ObjectCache._isObjectLike(a) && ObjectCache._isObjectLike(b)) {
        ObjectCache._merge(a, b, arrayStrategy);
      } else if (Array.isArray(a) && Array.isArray(b)) {
        if (arrayStrategy === "concat") {
          target[key] = a.concat(b);
        } else if (arrayStrategy === "unique") {
          const set = new Set([...a, ...b]);
          target[key] = Array.from(set);
        } else {
          // "replace"
          target[key] = JSON.parse(JSON.stringify(b));
        }
      } else if (b !== undefined) {
        // primitives, nulls, arrays replacing non-arrays, etc.
        target[key] = ObjectCache._isObjectLike(b) || Array.isArray(b)
          ? JSON.parse(JSON.stringify(b))
          : b;
      }
      // if b is undefined, skip (no-op)
    }
    return target;
  }
  /** Make BreadCache iterable */
  [Symbol.iterator]() {
    return this.entries()[Symbol.iterator]();
  }
  keys() {
    return Array.from(this._map.keys());
  }

}

const message_cache = new ObjectCache({ arrays: "replace" });
const user_cache = new ObjectCache({ arrays: "replace" });
const guild_cache = new ObjectCache({ arrays: "replace" });
const private_channels = new ObjectCache({ arrays: "replace" }); // these are DMs
const relationships = new ObjectCache({ arrays: "replace" }); // these are friends, blocked, etc.
let user_settings = null;
let user = null;

function normalizeId(value) {
  if (value == null) return null;
  try {
    const normalized = String(value);
    return normalized.length ? normalized : null;
  } catch (err) {
    return null;
  }
}

function collectMembers(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;

  if (collection instanceof Map) {
    return Array.from(collection.values());
  }

  if (typeof collection.values === 'function') {
    try {
      const values = Array.from(collection.values());
      if (values.length) return values;
    } catch (err) {
      /* ignore */
    }
  }

  if (typeof collection.forEach === 'function') {
    const values = [];
    try {
      collection.forEach((value) => values.push(value));
      if (values.length) return values;
    } catch (err) {
      /* ignore */
    }
  }

  if (typeof collection === 'object') {
    if (collection.user || collection.roles || collection.member) {
      return [collection];
    }
    return Object.values(collection);
  }

  return [];
}

function normalizeMemberMap(members) {
  const map = {};
  const list = collectMembers(members);
  for (const member of list) {
    if (!member || typeof member !== 'object') continue;
    const userId = normalizeId(member.user?.id ?? member.id);
    if (!userId) continue;
    map[userId] = member;
  }
  return Object.keys(map).length ? map : null;
}

BreadAPI.gateway.on_message((data) => {
  if (data.t === "READY") { 
    console.log("[BreadCache] Ready Event Received, caching initial data");
    for (const guild of data.d.guilds) {
      BreadCache.cacheGuild(guild);
      BreadCache.cacheGuildMembers(guild.id, guild.members);
    }
    console.log("[BreadCache] Guilds Cached!");
    for (const channel of data.d.private_channels) {
      private_channels.update(channel.id, channel);
    }
    console.log("[BreadCache] Private Channels Cached!");
    for (const relation of data.d.relationships) {
      relationships.update(relation.id, relation);
    }
    console.log("[BreadCache] Relationships Cached!");
    
    BreadCache.user = data.d.user;
    console.log("[BreadCache] User Cached!");

    BreadCache.user_settings = data.d.user_settings;
    console.log("[BreadCache] User Settings Cached!", user_settings);

    BreadCache.markReady();
  } else if (data.t === "MESSAGE_CREATE") {
    const msg = data.d;
    if (!msg) return;
    BreadCache.cacheMessage(msg);
    if (msg.author) BreadCache.cacheUser(msg.author);
    if (msg.member?.user) BreadCache.cacheUser(msg.member.user);
    if (msg.guild_id && msg.member) {
      BreadCache.cacheGuildMember(msg.guild_id, msg.member);
    }
  } else if (data.t === "MESSAGE_UPDATE") {
    const msg = data.d;
    if (!msg?.id) return;
    BreadCache.cacheMessage(msg);
    if (msg.author) BreadCache.cacheUser(msg.author);
    if (msg.guild_id && msg.member) {
      BreadCache.cacheGuildMember(msg.guild_id, msg.member);
    }
  } else if (data.t === "MESSAGE_DELETE") {
    const msg = data.d;
    if (msg?.id) {
      message_cache.delete(msg.id);
    }
  } else if (data.t === "MESSAGE_DELETE_BULK") {
    const payload = data.d;
    if (payload?.ids) {
      for (const id of payload.ids) {
        message_cache.delete(id);
      }
    }
  } else if (data.t === "GUILD_CREATE" || data.t === "GUILD_UPDATE") {
    const guild = data.d;
    if (!guild) return;
    BreadCache.cacheGuild(guild);
    BreadCache.cacheGuildMembers(guild.id, guild.members);
  } else if (data.t === "GUILD_MEMBERS_CHUNK") {
    const chunk = data.d;
    if (!chunk?.guild_id) return;
    BreadCache.cacheGuildMembers(chunk.guild_id, chunk.members);
  } else if (data.t === "GUILD_MEMBER_LIST_UPDATE") {
    const payload = data.d;
    const guildId = payload?.guild_id || payload?.guildId;
    if (!guildId || !Array.isArray(payload?.ops)) return;

    for (const op of payload.ops) {
      if (!op || !Array.isArray(op.items)) continue;
      for (const item of op.items) {
        const member = item?.member || null;
        if (!member) continue;
        const memberGuildId = member.guild_id || member.guildId || guildId;
        BreadCache.cacheGuildMember(memberGuildId, member);
        if (member.user) BreadCache.cacheUser(member.user);
      }
    }
  } else if (data.t === "GUILD_MEMBER_ADD" || data.t === "GUILD_MEMBER_UPDATE") {
    const member = data.d;
    if (!member) return;
    BreadCache.cacheGuildMember(member.guild_id || member.guildId, member);
    if (member.user) BreadCache.cacheUser(member.user);
  } else if (data.t === "GUILD_MEMBER_REMOVE") {
    const payload = data.d;
    if (!payload) return;
    BreadCache.removeGuildMember(payload.guild_id || payload.guildId, payload.user?.id ?? payload.user_id);
  } else if (data.t === "PRESENCE_UPDATE") {
    const presence = data.d;
    if (!presence) return;
    if (presence.guild_id && presence.member) {
      BreadCache.cacheGuildMember(presence.guild_id, presence.member);
    }
    if (presence.user) BreadCache.cacheUser(presence.user);
  }
});

class BreadCache {

  static #ready = false;
  static #readyCallbacks = [];

  static on_ready(fn) {
    if (this.#ready) {
      // already ready → fire immediately
      fn();
    } else {
      // queue until ready
      this.#readyCallbacks.push(fn);
    }
  }

  static markReady() {
    this.#ready = true;
    for (const fn of this.#readyCallbacks) {
      try { fn(); } catch (e) { console.error(e); }
    }
    this.#readyCallbacks = [];
  }

  static getMessage(id) { return message_cache.get(id); }
  static getUser(id) { return user_cache.get(id); }
  static getGuild(id) { return guild_cache.get(id); }
  static getPrivateChannel(id) { return private_channels.get(id); }
  static getRelationship(id) { return relationships.get(id); }
  static getCurrentUser() { return user; }

  static cacheMessage(msg) {
    if (!msg || !msg.id) return;
    message_cache.update(msg.id, msg);
  }

  static deleteMessage(id) {
    if (!id) return;
    message_cache.delete(id);
  }

  static cacheUser(u) {
    if (!u || !u.id) return;
    user_cache.update(u.id, u);
  }

  /**
   * Fetch a user from the Discord REST API and cache the result.
   * Returns the cached user object (after caching) or null on failure.
   * This is async and safe to call multiple times.
   */
  static async fetchUser(id) {
    if (!id) return null;
    try {
      if (typeof BreadAPI?.rest?.request !== 'function') {
        // no rest bridge available
        return null;
      }
      const res = await BreadAPI.rest.request({ method: 'GET', path: `/users/${id}` });
      const data = res && res.data ? res.data : null;
      if (data) {
        // cache and return
        user_cache.update(String(data.id || id), data);
        return BreadCache.getUser(String(data.id || id));
      }
    } catch (e) {
      console.warn('[BreadCache] fetchUser failed for', id, e && e.message ? e.message : e);
    }
    return null;
  }

  static cacheGuild(g) {
    if (!g || !g.id) return;
    const guildId = normalizeId(g.id);
    if (!guildId) return;
    const patch = { ...g, id: guildId };
    const normalizedMembers = normalizeMemberMap(g.members);
    if (normalizedMembers) {
      patch.members = normalizedMembers;
    } else {
      delete patch.members;
    }
    guild_cache.update(guildId, patch);
  }

  static cacheGuildMembers(guildId, members) {
    const normalizedGuildId = normalizeId(guildId);
    if (!normalizedGuildId) return;
    const normalizedMembers = normalizeMemberMap(members);
    if (!normalizedMembers) return;
    guild_cache.update(normalizedGuildId, { id: normalizedGuildId, members: normalizedMembers });
  }

  static cacheGuildMember(guildId, member) {
    const normalizedGuildId = normalizeId(guildId);
    if (!normalizedGuildId || !member) return;
    const normalizedMembers = normalizeMemberMap([member]);
    if (!normalizedMembers) return;
    guild_cache.update(normalizedGuildId, { id: normalizedGuildId, members: normalizedMembers });
  }

  static removeGuildMember(guildId, userId) {
    const normalizedGuildId = normalizeId(guildId);
    const normalizedUserId = normalizeId(userId);
    if (!normalizedGuildId || !normalizedUserId) return;
    const guild = guild_cache.get(normalizedGuildId);
    if (!guild || !guild.members) return;
    if (Array.isArray(guild.members)) {
      guild.members = guild.members.filter(member => normalizeId(member?.user?.id ?? member?.id) !== normalizedUserId);
    } else if (typeof guild.members === 'object') {
      delete guild.members[normalizedUserId];
    }
    guild_cache.set(normalizedGuildId, guild);
  }

  static cachePrivateChannel(c) {
    if (!c || !c.id) return;
    private_channels.update(c.id, c);
  }

  static cacheRelationship(r) {
    if (!r || !r.id) return;
    relationships.update(r.id, r);
  }

  static get guilds() {
    return guild_cache.values();
  }
}
window.BreadCache = BreadCache;