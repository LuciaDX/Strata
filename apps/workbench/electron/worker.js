import { parentPort, workerData } from "node:worker_threads";
import { Registry, runGraph, shareModules } from "@strata/core";
import { builtinNodes, scanPacks } from "@strata/nodes";

shareModules({ "@strata/core": import.meta.resolve("@strata/core"), "@strata/nodes": import.meta.resolve("@strata/nodes") });

function post(type, payload = {}) {
  parentPort.postMessage({ type, ...payload });
}

async function createRegistry(pluginDirs) {
  const registry = new Registry();
  registry.registerAll(builtinNodes);
  for (const dir of pluginDirs) {
    await registry.loadPlugins(dir);
  }
  return registry;
}

async function run({ graph, baseDir, pluginDirs }) {
  const registry = await createRegistry(pluginDirs);
  await runGraph(graph, registry, {
    baseDir,
    onNodeStart: (id) => post("start", { id }),
    onNodeDone: (id, ms) => post("done", { id, ms }),
    onNodeError: (id, error) => post("error", { id, message: error.message }),
    onNodeSkipped: (id) => post("skipped", { id }),
    onNodeMuted: (id) => post("muted", { id }),
    onLog: (id, level, message) => post("log", { id, level, message }),
  });
  return {};
}

async function scan({ folder, output, name }) {
  const set = await scanPacks(folder, { name, onPack: (pack) => post("progress", { pack }) });
  await set.save(output);
  return {
    meta: set.meta,
    counts: { paths: set.paths.size, entities: set.entities.size, sounds: set.sounds.size, uiElements: set.uiElements.size },
  };
}

const tasks = { run, scan };

try {
  post("result", { ok: true, result: await tasks[workerData.task](workerData) });
} catch (error) {
  post("result", { ok: false, message: error.message, id: error.nodeId ?? null });
}
