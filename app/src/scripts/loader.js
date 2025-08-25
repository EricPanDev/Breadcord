// Breadcord Plugin Loader
const REQUIRED_PLUGINS = ["breadcore"]

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

async function resolveLoadOrder(plugins) {
  // Fetch metadata
  const metas = await Promise.all(plugins.map(async (name) => {
    const res = await fetch(`plugins/${name}/plugin.json`);
    if (!res.ok) throw new Error(`Failed to load plugins/${name}/plugin.json (${res.status})`);
    const json = await res.json();
    const deps = Array.isArray(json.deps) ? json.deps : [];
    return { name, deps };
  }));

  // Only consider dependencies that are also in the input list
  const pluginSet = new Set(plugins);
  const depMap = new Map(
    metas.map(({ name, deps }) => [name, deps.filter(d => pluginSet.has(d))])
  );

  // (Optional) warn about missing deps that aren't in the list
  for (const { name, deps } of metas) {
    const missing = deps.filter(d => !pluginSet.has(d));
    if (missing.length) {
      console.warn(`Plugin "${name}" has missing deps not in load set: ${missing.join(', ')}`);
      // If you prefer to be strict, replace the console.warn with:
      // throw new Error(`Plugin "${name}" depends on missing plugins: ${missing.join(', ')}`);
    }
  }

  const sorted = [];
  const temp = new Set();   // for cycle detection (DFS stack)
  const perm = new Set();   // permanently visited

  function visit(n) {
    if (perm.has(n)) return;
    if (temp.has(n)) {
      // Build a readable cycle string
      const stack = [...temp, n];
      throw new Error(`Circular dependency detected: ${stack.join(' -> ')}`);
    }
    temp.add(n);
    const deps = depMap.get(n) || [];
    for (const d of deps) visit(d);
    temp.delete(n);
    perm.add(n);
    sorted.push(n); // postorder: deps get pushed first
  }

  for (const p of plugins) visit(p);

  return sorted.reverse();
}

BreadAPI.ready.then(async () => {
  BreadAPI.info('Breadcord ready, found ' + BreadAPI.plugins.length + ' plugin(s): ' + BreadAPI.plugins.join(', '));
  const loadOrder = await resolveLoadOrder(BreadAPI.plugins);
  BreadAPI.info('Resolved load order: ' + loadOrder.join(', '));
  for (const plugin of loadOrder) {
    await load_plugin(plugin);
  }
  BreadAPI.info('All plugins loaded!');
});