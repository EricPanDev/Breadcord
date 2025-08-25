// Breadcord Plugin Loader

function load_plugin(plugin) {
  BreadAPI.info(`Loading plugin ${plugin}...`);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `plugins/${plugin}/plugin.js`;
    script.onload = () => {
      BreadAPI.info(`Plugin ${plugin} loaded successfully.`);
      resolve();
    };
    script.onerror = () => {
      BreadAPI.error(`Failed to load plugin ${plugin}`);
      reject(new Error(`Failed to load plugin ${plugin}`));
    };
    document.head.appendChild(script);
  });
}

// Node.js version (uses fs). If you need a browser/fetch version, see below.

/**
 * Determine a safe load order for BreadAPI.plugins so that dependencies load first.
 * @param {string[]} pluginNames - e.g., BreadAPI.plugins
 * @param {string} pluginsRoot - root folder that contains plugin directories
 * @returns {Promise<string[]>} load order (deps first)
 * @throws on missing plugin.json, missing dependency, or circular dependency
 */

async function readPluginJson(pluginsRoot, name) {
  const url = `${pluginsRoot}/${encodeURIComponent(name)}/plugin.json`;
  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    throw new Error(`Missing or invalid plugin.json for "${name}" at ${url}: ${err.message}`);
  }
  const id = data.id || name;
  const deps = Array.isArray(data.dependencies) ? data.dependencies : [];
  return { id, name: id, deps };
}

async function determinePluginLoadOrder(pluginNames, pluginsRoot = 'plugins') {
  // Read all plugin.json files for the declared plugins
  const uniqueNames = Array.from(new Set(pluginNames));
  const metaByName = new Map();
  for (const n of uniqueNames) {
    const meta = await readPluginJson(pluginsRoot, n);
    metaByName.set(meta.name, meta);
  }

  // Validate: every declared dependency must be present among plugins
  for (const { name, deps } of metaByName.values()) {
    for (const d of deps) {
      if (!metaByName.has(d)) {
        // Helpful hint: show where we looked
        const jsonPath = path.join(pluginsRoot, d, 'plugin.json');
        throw new Error(
          `Plugin "${name}" depends on "${d}", but "${d}" is not in BreadAPI.plugins or ${jsonPath} is missing.`
        );
      }
    }
  }

  // Topological sort (DFS with cycle detection)
  const VISIT = { UNVISITED: 0, VISITING: 1, DONE: 2 };
  const state = new Map(Array.from(metaByName.keys()).map((k) => [k, VISIT.UNVISITED]));
  const order = [];

  function dfs(node, stack) {
    const s = state.get(node);
    if (s === VISIT.DONE) return;
    if (s === VISIT.VISITING) {
      // cycle: reconstruct a readable path
      const cycleStartIdx = stack.indexOf(node);
      const cyclePath = [...stack.slice(cycleStartIdx), node].join(' -> ');
      throw new Error(`Circular dependency detected: ${cyclePath}`);
    }
    state.set(node, VISIT.VISITING);
    stack.push(node);

    const deps = metaByName.get(node)?.deps || [];
    for (const d of deps) dfs(d, stack);

    stack.pop();
    state.set(node, VISIT.DONE);
    order.push(node); // post-order: node after its deps
  }

  // Sort keys for deterministic output, then DFS
  const all = Array.from(metaByName.keys()).sort();
  for (const n of all) {
    if (state.get(n) === VISIT.UNVISITED) dfs(n, []);
  }

  // 'order' currently has deps before dependents, which is what we want.
  // However, if you prefer preserving only declared plugins (in case of extra metadata),
  // filter to the original set (by name/id equivalence).
  return order.filter((n) => metaByName.has(n));
}

BreadAPI.ready.then(async () => {
  BreadAPI.info('Breadcord ready, found ' + BreadAPI.plugins.length + ' plugin(s): ' + BreadAPI.plugins.join(', '));
  const loadOrder = (await determinePluginLoadOrder(BreadAPI.plugins));
  BreadAPI.info('Resolved load order: ' + loadOrder.join(', '));
  for (const plugin of loadOrder) {
    await load_plugin(plugin);
  }
  BreadAPI.info('All plugins loaded!');
});