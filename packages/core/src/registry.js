import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXEC, GROUP_FORMAT } from "./ports.js";

export class Registry {
  constructor(parent = null) {
    this.parent = parent;
    this.nodes = new Map();
    this.aliases = new Map();
  }

  register(definition) {
    const node = normalizeDefinition(definition);
    this.nodes.set(node.type, node);
    for (const alias of node.aliases) {
      this.aliases.set(alias, node);
    }
    return node;
  }

  registerAll(definitions) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  extend(definitions) {
    const child = new Registry(this);
    child.registerAll(definitions);
    return child;
  }

  get(type) {
    return this.nodes.get(type) ?? this.aliases.get(type) ?? this.parent?.get(type);
  }

  list() {
    const merged = new Map((this.parent?.list() ?? []).map((node) => [node.type, node]));
    for (const node of this.nodes.values()) {
      merged.set(node.type, node);
    }
    return [...merged.values()];
  }

  async loadPlugins(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const loaded = [];
    for (const entry of entries) {
      for (const definition of await loadEntry(directory, entry)) {
        loaded.push(this.register(definition));
      }
    }
    return loaded;
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function isGroupFile(name) {
  return name.endsWith(".group.json");
}

async function loadGroupFile(file) {
  const group = JSON.parse(await readFile(file, "utf8"));
  if (group.format !== GROUP_FORMAT || typeof group.type !== "string") {
    throw new Error(`${file} is not a Strata group, it needs "format": "${GROUP_FORMAT}" and a "type"`);
  }
  return groupDefinition(group.type, group, file);
}

async function loadModule(file) {
  const module = await import(pathToFileURL(file).href);
  return collectDefinitions(module).map((definition) => ({ ...definition, source: file }));
}

async function loadEntry(directory, entry) {
  const path = resolve(join(directory, entry.name));
  if (entry.isFile() && isGroupFile(entry.name)) {
    return [await loadGroupFile(path)];
  }
  if (entry.isFile() && /\.(m?js)$/.test(entry.name)) {
    return loadModule(path);
  }
  if (!entry.isDirectory()) {
    return [];
  }
  const definitions = [];
  for (const name of ["index.js", "index.mjs"]) {
    const file = join(path, name);
    if (await exists(file)) {
      definitions.push(...(await loadModule(file)));
      break;
    }
  }
  for (const inner of await readdir(path, { withFileTypes: true })) {
    if (inner.isFile() && isGroupFile(inner.name)) {
      definitions.push(await loadGroupFile(join(path, inner.name)));
    }
  }
  return definitions;
}

function collectDefinitions(module) {
  const candidates = [];
  for (const value of Object.values(module)) {
    if (Array.isArray(value)) {
      candidates.push(...value);
    } else {
      candidates.push(value);
    }
  }
  return candidates.filter((value) => value && typeof value === "object" && typeof value.type === "string" && (typeof value.run === "function" || isObjectBody(value.group)));
}

function isObjectBody(group) {
  return Boolean(group) && Array.isArray(group.nodes) && Array.isArray(group.links);
}

export function groupDefinition(type, group, source) {
  const { format, nodes, links, ...rest } = group;
  return {
    category: "Groups",
    ...rest,
    type,
    group: { nodes: nodes ?? [], links: links ?? [] },
    ...(source ? { source } : {}),
  };
}

function normalizePorts(ports = {}) {
  const normalized = {};
  for (const [name, spec] of Object.entries(ports)) {
    normalized[name] = typeof spec === "string" ? { type: spec, optional: false } : { optional: false, ...spec };
  }
  return normalized;
}

function hasExec(ports) {
  return Object.values(ports).some((spec) => spec.type === EXEC);
}

function withExecPorts(definition, inputs, outputs) {
  for (const spec of Object.values(inputs)) {
    if (spec.type === EXEC) {
      spec.optional = true;
      spec.multiple = true;
    }
  }
  if (definition.pure) {
    return { inputs, outputs };
  }
  const execIn = definition.start || hasExec(inputs) ? {} : { exec: { type: EXEC, optional: true, multiple: true } };
  const execOut = definition.end || hasExec(outputs) ? {} : { then: { type: EXEC, optional: false } };
  return { inputs: { ...execIn, ...inputs }, outputs: { ...execOut, ...outputs } };
}

function normalizeDefinition(definition) {
  const isGroup = isObjectBody(definition?.group);
  if (!definition || typeof definition.type !== "string" || (typeof definition.run !== "function" && !isGroup)) {
    throw new Error("A node needs a string \"type\" and a \"run\" function");
  }
  const ports = withExecPorts(definition, normalizePorts(definition.inputs), normalizePorts(definition.outputs));
  return {
    title: definition.type,
    category: "Other",
    description: "",
    ...definition,
    pure: Boolean(definition.pure),
    start: Boolean(definition.start),
    end: Boolean(definition.end),
    inputs: ports.inputs,
    outputs: ports.outputs,
    params: definition.params ?? {},
    aliases: definition.aliases ?? [],
    renamedPorts: definition.renamedPorts ?? {},
    group: isGroup ? definition.group : null,
  };
}
