// BreadCache
/**
 * BreadCache — store and retrieve objects by ID, with merge-on-update.
 * - Deep-merges plain objects when updating an existing entry.
 * - Arrays are REPLACED by default; set arrays: "concat" | "unique" to change.
 * - IDs are explicit (first arg), not inferred from the object.
 */
class BreadCache {
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
    return this._clone ? BreadCache._clone(v) : v;
  }

  /** Check if an ID exists. */
  has(id) { return this._map.has(id); }

  /** Set/overwrite an ID with an object. */
  set(id, obj) {
    if (!BreadCache._isObjectLike(obj)) {
      throw new TypeError("BreadCache.set expects a plain object value");
    }
    this._map.set(id, this._clone ? BreadCache._clone(obj) : obj);
    return this;
  }

  /**
   * Update by ID: if it exists, deep-merge; otherwise create it.
   * @param {string|number} id
   * @param {Object} patch - partial object to merge
   */
  update(id, patch) {
    if (!BreadCache._isObjectLike(patch)) {
      throw new TypeError("BreadCache.update expects a plain object patch");
    }
    const existing = this._map.get(id);
    if (!existing) {
      // create new
      this._map.set(id, this._clone ? BreadCache._clone(patch) : { ...patch });
      return this.get(id);
    }
    const merged = BreadCache._merge(existing, patch, this._arrayStrategy);
    this._map.set(id, merged);
    return this._clone ? BreadCache._clone(merged) : merged;
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
      .map(([k, v]) => [k, this._clone ? BreadCache._clone(v) : v]);
  }

  /** Get all values. */
  values() {
    return Array.from(this._map.values())
      .map(v => (this._clone ? BreadCache._clone(v) : v));
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

      if (BreadCache._isObjectLike(a) && BreadCache._isObjectLike(b)) {
        BreadCache._merge(a, b, arrayStrategy);
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
        target[key] = BreadCache._isObjectLike(b) || Array.isArray(b)
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

const message_cache = new BreadCache({ arrays: "replace" });
const user_cache = new BreadCache({ arrays: "replace" });
const guild_cache = new BreadCache({ arrays: "replace" });
const private_channels = new BreadCache({ arrays: "replace" }); // these are DMs
const relationships = new BreadCache({ arrays: "replace" }); // these are friends, blocked, etc.
let user = null;

BreadAPI.gateway.on_message((data) => {
  if (data.t === "READY") { 
    console.log("[BreadCache] Ready Event Received, caching initial data");
    for (const guild of data.d.guilds) {
      guild_cache.update(guild.id, guild);
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
    user = data.d.user;
    console.log("[BreadCache] User Cached!");
  }
});