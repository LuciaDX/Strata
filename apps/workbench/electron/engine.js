import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";
import { access, copyFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { basename, dirname, extname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { PATH_STATES, Registry, isForeignPath, isInside, resolvePath, shareModules, upgradeGraph } from "@strata/core";
import { builtinNodes } from "@strata/nodes";

shareModules({ "@strata/core": import.meta.resolve("@strata/core"), "@strata/nodes": import.meta.resolve("@strata/nodes") });

function bundledPlugins() {
  return app.isPackaged ? join(process.resourcesPath, "plugins") : fileURLToPath(new URL("../../../plugins", import.meta.url));
}

async function createRegistry(pluginDirs) {
  const registry = new Registry();
  registry.registerAll(builtinNodes);
  for (const dir of pluginDirs) {
    await registry.loadPlugins(dir);
  }
  return registry;
}

function describe(node) {
  return {
    type: node.type,
    title: node.title,
    icon: node.icon ?? null,
    category: node.category,
    description: node.description,
    inputs: node.inputs,
    outputs: node.outputs,
    params: node.params,
    pure: node.pure,
    growOutputs: node.growOutputs ?? null,
    start: node.start,
    end: node.end,
    group: node.group,
    renamedPorts: node.renamedPorts,
    source: node.source ?? null,
  };
}

function startTask(data, onMessage) {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { workerData: data });
  const done = new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    worker.on("message", (message) => (message.type === "result" ? finish(message) : onMessage(message)));
    worker.on("error", (error) => finish({ ok: false, message: error.message, id: null }));
    worker.on("exit", () => finish({ ok: false, stopped: true, message: "stopped", id: null }));
  });
  return { worker, done };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function pathState(baseDir, { path, output }) {
  if (isForeignPath(path, process.platform)) {
    return PATH_STATES.foreign;
  }
  const target = resolvePath(baseDir, path);
  return (await exists(output ? parse(target).root : target)) ? PATH_STATES.ok : PATH_STATES.missing;
}

async function freeName(folder, name, taken) {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let index = 1; ; index++) {
    const candidate = index === 1 ? name : `${stem}-${index}${extension}`;
    const target = join(folder, candidate);
    if (!taken.has(target.toLowerCase()) && !(await exists(target))) {
      taken.add(target.toLowerCase());
      return candidate;
    }
  }
}

async function collectPaths(baseDir, entries) {
  const copied = new Map();
  const taken = new Set();
  const results = [];
  for (const entry of entries) {
    const source = resolvePath(baseDir, entry.path);
    if (isInside(baseDir, source)) {
      results.push({ path: entry.path, copied: false });
      continue;
    }
    const key = source.toLowerCase();
    if (!copied.has(key)) {
      const name = await freeName(baseDir, basename(source), taken);
      if (!entry.output) {
        const info = await stat(source);
        if (info.isDirectory()) {
          await cp(source, join(baseDir, name), { recursive: true });
        } else {
          await copyFile(source, join(baseDir, name));
        }
      }
      copied.set(key, name);
    }
    results.push({ path: copied.get(key), copied: !entry.output });
  }
  return results;
}

function windowOf(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerEngine(userData) {
  const userPlugins = join(userData, "plugins");
  const appPlugins = [bundledPlugins(), userPlugins];
  let activeRun = null;

  ipcMain.handle("nodes:list", async () => {
    const registry = await createRegistry(appPlugins);
    return { nodes: registry.list().map(describe), pluginFolder: userPlugins };
  });

  ipcMain.handle("plugins:open", async () => {
    await mkdir(userPlugins, { recursive: true });
    return shell.openPath(userPlugins);
  });

  ipcMain.handle("dialog:open", (event, options) => dialog.showOpenDialog(windowOf(event), options));

  ipcMain.handle("dialog:save", (event, options) => dialog.showSaveDialog(windowOf(event), options));

  ipcMain.handle("file:read", (event, path) => readFile(path, "utf8"));

  ipcMain.handle("file:write", (event, path, text) => writeFile(path, text, "utf8"));

  ipcMain.handle("file:inspect", async (event, path) => {
    try {
      const data = JSON.parse(await readFile(path, "utf8"));
      if (data.format === "strata-exclusions" || data.format === "strata-references") {
        return { kind: "exclusions", meta: data.meta ?? {} };
      }
      if (Array.isArray(data.paths) && Array.isArray(data.entities)) {
        return { kind: "exclusions", meta: { name: "legacy index" } };
      }
      if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
        return { kind: "graph" };
      }
      return { kind: "json" };
    } catch {
      return { kind: "unknown" };
    }
  });

  ipcMain.handle("paths:check", async (event, { baseDir, entries }) => {
    const root = baseDir ?? process.cwd();
    return Promise.all(entries.map((entry) => pathState(root, entry)));
  });

  ipcMain.handle("paths:collect", (event, { baseDir, entries }) => collectPaths(baseDir, entries));

  ipcMain.handle("graph:upgrade", async (event, { graph, baseDir }) => {
    const root = baseDir ?? process.cwd();
    const graphPlugins = (graph.plugins ?? []).map((dir) => resolvePath(root, dir));
    const registry = await createRegistry([...appPlugins, ...graphPlugins]);
    return upgradeGraph(graph, registry);
  });

  ipcMain.handle("graph:run", async (event, { graph, baseDir }) => {
    const send = (type, payload = {}) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("run:event", { ...payload, type });
      }
    };
    if (activeRun) {
      return { ok: false, message: "A run is already going" };
    }
    const root = baseDir ?? process.cwd();
    const pluginDirs = [...appPlugins, ...(graph.plugins ?? []).map((dir) => resolvePath(root, dir))];
    const started = performance.now();
    const task = startTask({ task: "run", graph, baseDir: root, pluginDirs }, (message) => send(message.type, message));
    activeRun = task.worker;
    const result = await task.done;
    activeRun = null;
    if (result.ok) {
      send("finished", { ms: performance.now() - started });
    } else if (result.stopped) {
      send("stopped", { ms: performance.now() - started });
    } else {
      send("failed", { id: result.id, message: result.message });
    }
    return { ok: result.ok, message: result.message, id: result.id ?? null };
  });

  ipcMain.handle("graph:stop", async () => {
    if (!activeRun) {
      return false;
    }
    await activeRun.terminate();
    return true;
  });

  ipcMain.handle("scan:run", async (event, { folder, output, name }) => {
    const task = startTask({ task: "scan", folder, output, name }, (message) => {
      if (message.type === "progress" && !event.sender.isDestroyed()) {
        event.sender.send("scan:progress", message.pack);
      }
    });
    const result = await task.done;
    if (!result.ok) {
      throw new Error(result.message);
    }
    return result.result;
  });
}
