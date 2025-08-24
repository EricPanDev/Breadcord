// Note to plugin devs: BreadAPI.ready is already resolved as its used by the plugin loader. no need to await it.

// BreadAPI.info('Breadcore plugin loading...');

// BreadAPI.gateway.on_message((payload) => {
//     BreadAPI.info(`[GW] ${JSON.stringify(payload).slice(0, 130)}...`);
//   });

/**
 * BreadUI: register element types, create containers/elements,
 * get containers by id, and run "before_dom_addition" hooks.
 */
class BreadUI {
  // --- registries ---
  static #types = new Map();          // typeName -> { style }
  static #containers = new Map();     // id -> Container
  static #hooks = new Map();          // typeName -> Set<fn(child, parent)>

  // --- type registry ---
  /**
   * Register a UI element type with an optional default style.
   * @param {string} typeName
   * @param {object} [style={}]
   */
  static create_type(typeName, style = {}) {
    if (!typeName || typeof typeName !== "string") {
      throw new Error("create_type: typeName must be a non-empty string");
    }
    BreadUI.#types.set(typeName, { style: { ...style } });
    if (!BreadUI.#hooks.has(typeName)) BreadUI.#hooks.set(typeName, new Set());
  }

  // --- element factory (convenience) ---
  /**
   * Create a leaf element of a registered type.
   * @param {string} typeName
   * @param {object} [style]
   * @param {object} [data] arbitrary payload, e.g. { text: "hello" }
   * @returns {UIElement}
   */
  static create_element(typeName, style = {}, data = {}) {
    BreadUI.#assertTypeRegistered(typeName);
    const base = BreadUI.#types.get(typeName) || { style: {} };
    return new UIElement(typeName, BreadUI.#mergeStyles(base.style, style), data);
  }

  // --- container factory ---
  /**
   * Create a container with an id and a registered type.
   * @param {string} id
   * @param {string} typeName
   * @param {object} [style]
   * @returns {UIContainer}
   */
  static create_container(id, typeName, style = {}) {
    if (!id || typeof id !== "string") {
      throw new Error("create_container: id must be a non-empty string");
    }
    BreadUI.#assertTypeRegistered(typeName);
    if (BreadUI.#containers.has(id)) {
      throw new Error(`create_container: a container with id "${id}" already exists`);
    }
    const base = BreadUI.#types.get(typeName) || { style: {} };
    const container = new UIContainer(id, typeName, BreadUI.#mergeStyles(base.style, style));
    BreadUI.#containers.set(id, container);
    return container;
  }

  // --- retrieval ---
  /**
   * Fetch a container by id.
   * @param {string} id
   * @returns {UIContainer | undefined}
   */
  static get_container(id) {
    return BreadUI.#containers.get(id);
  }

  // --- hooks ---
  /**
   * Register a hook to run before an element/subcontainer of a given type
   * is added to any container.
   * The hook receives (child, parentContainer).
   * @param {string} typeName
   * @param {(child:UIElement|UIContainer, parent:UIContainer)=>void} fn
   */
  static before_dom_addition(typeName, fn) {
    BreadUI.#assertTypeRegistered(typeName);
    if (typeof fn !== "function") {
      throw new Error("before_dom_addition: fn must be a function");
    }
    if (!BreadUI.#hooks.has(typeName)) BreadUI.#hooks.set(typeName, new Set());
    BreadUI.#hooks.get(typeName).add(fn);
  }

  /**
   * Runs hooks for a child about to be added to a parent container.
   * Public (not a #private field) so other classes can call it without TS18013.
   * @param {UIElement|UIContainer} child
   * @param {UIContainer} parent
   */
  static runHooksFor(child, parent) {
    const set = BreadUI.#hooks.get(child.type);
    if (!set || set.size === 0) return;
    for (const fn of set) {
      fn(child, parent); // (itself, parent container)
    }
  }

  // --- internal helpers ---
  static #assertTypeRegistered(typeName) {
    if (!BreadUI.#types.has(typeName)) {
      throw new Error(`Type "${typeName}" is not registered. Call BreadUI.create_type("${typeName}", style) first.`);
    }
  }

  static #mergeStyles(base = {}, override = {}) {
    return { ...base, ...override };
  }
}

/** Base: common fields for elements/containers */
class UINode {
  constructor(type, style = {}) {
    this.type = type;
    this.style = { ...style };
    this.meta = {}; // optional bag for user data
  }

  /**
   * Render to a DOM node (HTMLElement) with inline styles.
   * Override in subclasses to add content/children.
   */
  toDOM() {
    const el = document.createElement("div");
    UINode.#applyStyle(el, this.style);
    el.dataset.type = this.type;
    return el;
  }

  static #applyStyle(domEl, styleObj) {
    Object.entries(styleObj || {}).forEach(([k, v]) => {
      if (k.startsWith("--")) domEl.style.setProperty(k, v);
      else domEl.style[k] = v;
    });
  }
}

/** Leaf element (no children) */
class UIElement extends UINode {
  constructor(type, style = {}, data = {}) {
    super(type, style);
    this.data = { ...data }; // e.g., { text, html, attrs }
  }

  toDOM() {
    const el = super.toDOM();
    if (this.data.html != null) {
      el.innerHTML = String(this.data.html);
    } else if (this.data.text != null) {
      el.textContent = String(this.data.text);
    }
    if (this.data.attrs && typeof this.data.attrs === "object") {
      for (const [k, v] of Object.entries(this.data.attrs)) {
        el.setAttribute(k, v);
      }
    }
    return el;
  }
}

/** Container node with children */
class UIContainer extends UINode {
  constructor(id, type, style = {}) {
    super(type, style);
    this.id = id;
    this.children = [];
  }

  /**
   * Add a child (UIElement or UIContainer).
   * Runs any registered before_dom_addition hooks for the CHILD's type.
   * @param {UIElement|UIContainer} child
   */
  add(child) {
    if (!(child instanceof UINode)) {
      throw new Error("container.add: child must be a UIElement or UIContainer");
    }
    // call the public method to avoid TS18013
    BreadUI.runHooksFor(child, this);
    this.children.push(child);
    return this; // chainable
  }

  toDOM() {
    const el = super.toDOM();
    el.dataset.containerId = this.id;
    for (const child of this.children) {
      el.appendChild(child.toDOM());
    }
    return el;
  }

  /**
   * Mount this container into a host DOM element.
   * @param {HTMLElement|string} host element or selector
   */
  mount(host) {
    const root = typeof host === "string" ? document.querySelector(host) : host;
    if (!root) throw new Error("mount: host not found");
    root.appendChild(this.toDOM());
  }
}