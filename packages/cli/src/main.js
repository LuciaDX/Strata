#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Registry, loadGraph, resolvePath, runGraph, shareModules } from "@strata/core";
import { builtinNodes, scanPacks } from "@strata/nodes";

const BUNDLED_PLUGINS = fileURLToPath(new URL("../../../plugins", import.meta.url));

shareModules({ "@strata/core": import.meta.resolve("@strata/core"), "@strata/nodes": import.meta.resolve("@strata/nodes") });

function parseArgs(argv) {
  const positional = [];
  const plugins = [];
  let name;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plugins") {
      plugins.push(argv[++i]);
    } else if (argv[i] === "--name") {
      name = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  return { command: positional[0], positional: positional.slice(1), plugins, name };
}

async function createRegistry(pluginDirs) {
  const registry = new Registry();
  registry.registerAll(builtinNodes);
  await registry.loadPlugins(BUNDLED_PLUGINS);
  for (const dir of pluginDirs) {
    const loaded = await registry.loadPlugins(dir);
    for (const node of loaded) {
      console.log(`plugin ${node.type} from ${node.source}`);
    }
  }
  return registry;
}

async function runCommand(file, pluginDirs) {
  const { graph, baseDir } = await loadGraph(file);
  const graphPlugins = (graph.plugins ?? []).map((dir) => resolvePath(baseDir, dir));
  const registry = await createRegistry([...pluginDirs, ...graphPlugins]);
  const started = performance.now();
  await runGraph(graph, registry, {
    baseDir,
    onNodeDone: (id, ms) => console.log(`[${id}] done in ${ms.toFixed(0)} ms`),
  });
  console.log(`finished in ${((performance.now() - started) / 1000).toFixed(2)} s`);
}

async function nodesCommand(pluginDirs) {
  const registry = await createRegistry(pluginDirs);
  for (const node of registry.list()) {
    const inputs = Object.entries(node.inputs).map(([name, port]) => `${name}:${port.type}`).join(", ");
    const outputs = Object.entries(node.outputs).map(([name, port]) => `${name}:${port.type}`).join(", ");
    console.log(`${node.type.padEnd(16)} ${node.title.padEnd(14)} in(${inputs}) out(${outputs})`);
  }
}

async function scanCommand(folder, output, name) {
  const started = performance.now();
  const set = await scanPacks(resolve(folder), {
    name,
    onPack: (pack) => console.log(`scanned ${pack.name}${pack.version ? " " + pack.version : ""}`),
  });
  await set.save(resolve(output));
  const counts = ["paths", "geometry", "animations", "entities", "particles", "sounds", "materials", "uiElements"].map((field) => `${field} ${set[field].size}`);
  console.log(`${set.meta.name}${set.meta.gameVersion ? " " + set.meta.gameVersion : ""}: ${counts.join(", ")}`);
  console.log(`saved ${resolve(output)} in ${((performance.now() - started) / 1000).toFixed(2)} s`);
}

function usage() {
  console.log("Usage:");
  console.log("  strata run <graph.json> [--plugins <dir>]");
  console.log("  strata nodes [--plugins <dir>]");
  console.log("  strata scan <packs-folder> <output.json> [--name <name>]");
  process.exitCode = 1;
}

async function main() {
  const { command, positional, plugins, name } = parseArgs(process.argv.slice(2));
  if (command === "run" && positional[0]) {
    await runCommand(positional[0], plugins);
  } else if (command === "scan" && positional[1]) {
    await scanCommand(positional[0], positional[1], name);
  } else if (command === "nodes") {
    await nodesCommand(plugins);
  } else {
    usage();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
