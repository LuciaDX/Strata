import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isAbsolutePath, isForeignPath } from "./paths.js";
import { EXEC, GROUP_INPUT, GROUP_OUTPUT } from "./ports.js";
import { groupDefinition } from "./registry.js";

export { EXEC, GROUP_INPUT, GROUP_OUTPUT };

const MAX_GROUP_DEPTH = 16;

export function resolvePath(baseDir, path) {
  if (isForeignPath(path, process.platform)) {
    throw new Error(`"${path}" is a path from another computer, choose it again in the workbench`);
  }
  return isAbsolutePath(path) ? resolve(path) : resolve(baseDir, path.replaceAll("\\", "/"));
}

export async function loadGraph(file) {
  const graph = JSON.parse(await readFile(file, "utf8"));
  return { graph, baseDir: dirname(resolve(file)) };
}

function parseEndpoint(endpoint) {
  const dot = endpoint.lastIndexOf(".");
  if (dot <= 0 || dot === endpoint.length - 1) {
    throw new Error(`Invalid link endpoint "${endpoint}", expected "node.port"`);
  }
  return { node: endpoint.slice(0, dot), port: endpoint.slice(dot + 1) };
}

function renameEndpoint(endpoint, nodes) {
  const { node, port } = parseEndpoint(endpoint);
  const definition = nodes.get(node);
  const renamed = definition?.renamedPorts?.[port];
  return renamed ? `${node}.${renamed}` : endpoint;
}

export function growIndex(definition, port) {
  const prefix = definition?.growOutputs;
  if (!prefix || !port.startsWith(prefix)) {
    return null;
  }
  const rest = port.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(rest) ? Number(rest) : null;
}

export function outputSpec(definition, port) {
  return definition?.outputs?.[port] ?? (growIndex(definition, port) !== null ? { type: EXEC, optional: false } : undefined);
}

function execOrder(definition, next) {
  const fixed = Object.entries(definition.outputs)
    .filter(([port, spec]) => spec.type === EXEC && growIndex(definition, port) === null)
    .map(([port]) => port);
  const grown = [...next.keys()].filter((port) => growIndex(definition, port) !== null).sort((a, b) => growIndex(definition, a) - growIndex(definition, b));
  return [...fixed, ...grown];
}

function isStep(definition) {
  return Boolean(definition) && !definition.pure && !definition.start;
}

function execPort(ports) {
  return Object.entries(ports ?? {}).find(([, spec]) => spec.type === EXEC)?.[0] ?? null;
}

function dataOrder(nodes, links) {
  const ids = nodes.map((node) => node.id);
  const pending = new Map(ids.map((id) => [id, new Set()]));
  const outgoing = new Map(ids.map((id) => [id, new Set()]));
  for (const link of links) {
    const from = parseEndpoint(link.from).node;
    const to = parseEndpoint(link.to).node;
    if (pending.has(to) && outgoing.has(from) && from !== to) {
      pending.get(to).add(from);
      outgoing.get(from).add(to);
    }
  }
  const order = [];
  const ready = ids.filter((id) => pending.get(id).size === 0);
  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const next of outgoing.get(id)) {
      pending.get(next).delete(id);
      if (pending.get(next).size === 0) {
        ready.push(next);
      }
    }
  }
  return order.length === ids.length ? order : ids;
}

function addExecChain(nodes, links, registry) {
  const start = registry.get("start");
  if (!start || nodes.some((node) => registry.get(node.type)?.start)) {
    return { nodes, links };
  }
  if (links.some((link) => isExecLink(link, nodes, registry))) {
    return { nodes, links };
  }
  const taken = new Set(nodes.map((node) => node.id));
  let id = "start";
  for (let counter = 2; taken.has(id); counter++) {
    id = `start_${counter}`;
  }
  const positions = nodes.map((node) => node.position).filter(Boolean);
  const position = positions.length > 0 ? { x: Math.min(...positions.map((p) => p.x)) - 340, y: Math.min(...positions.map((p) => p.y)) } : undefined;
  const startNode = position ? { id, type: start.type, params: {}, position } : { id, type: start.type, params: {} };

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const steps = dataOrder(nodes, links).filter((nodeId) => isStep(registry.get(byId.get(nodeId).type)));
  const chain = [];
  let previous = `${id}.${execPort(start.outputs)}`;
  for (const step of steps) {
    const definition = registry.get(byId.get(step).type);
    chain.push({ from: previous, to: `${step}.${execPort(definition.inputs)}` });
    previous = `${step}.${execPort(definition.outputs)}`;
  }
  return { nodes: [startNode, ...nodes], links: [...chain, ...links] };
}

function isExecLink(link, nodes, registry) {
  const { node, port } = parseEndpoint(link.from);
  const type = nodes.find((candidate) => candidate.id === node)?.type;
  return outputSpec(registry.get(type), port)?.type === EXEC;
}

function upgradeBody(body, registry) {
  const definitions = new Map();
  const nodes = (body.nodes ?? []).map((node) => {
    const definition = registry.get(node.type);
    definitions.set(node.id, definition);
    return definition && definition.type !== node.type ? { ...node, type: definition.type } : node;
  });
  const links = (body.links ?? []).map((link) => ({
    ...link,
    from: renameEndpoint(link.from, definitions),
    to: renameEndpoint(link.to, definitions),
  }));
  return { ...body, nodes, links };
}

export function localGroups(groups) {
  return Object.entries(groups ?? {}).map(([type, group]) => groupDefinition(type, group));
}

export function withGroups(registry, groups) {
  const definitions = localGroups(groups);
  return definitions.length > 0 ? registry.extend(definitions) : registry;
}

export function groupIo(definition, inputs = {}, collected = {}) {
  const dataPorts = (ports) => Object.entries(ports ?? {}).filter(([, spec]) => spec.type !== EXEC);
  const outputs = {};
  for (const [name, spec] of dataPorts(definition.inputs)) {
    outputs[name] = { ...spec, optional: true, spread: Boolean(spec.multiple), multiple: false };
  }
  const ends = {};
  for (const [name, spec] of dataPorts(definition.outputs)) {
    ends[name] = { type: spec.type, optional: true };
  }
  return [
    {
      type: GROUP_INPUT,
      title: "Group Input",
      icon: "login",
      category: "Groups",
      description: "Values passed into the group",
      start: true,
      outputs: { then: { type: EXEC }, ...outputs },
      run: () => ({ ...inputs }),
    },
    {
      type: GROUP_OUTPUT,
      title: "Group Output",
      icon: "logout",
      category: "Groups",
      description: "Values the group passes on",
      end: true,
      inputs: { exec: { type: EXEC, optional: true, multiple: true }, ...ends },
      run: ({ inputs: values }) => {
        Object.assign(collected, values);
        return {};
      },
    },
  ];
}

export function groupCopy(definition) {
  const copy = structuredClone({
    title: definition.title,
    icon: definition.icon,
    category: definition.category,
    description: definition.description,
    inputs: definition.inputs,
    outputs: definition.outputs,
    nodes: definition.group.nodes,
    links: definition.group.links,
  });
  if (Object.keys(definition.renamedPorts ?? {}).length > 0) {
    copy.renamedPorts = structuredClone(definition.renamedPorts);
  }
  return copy;
}

function liftLegacyParams(graph, registry) {
  let groups = graph.groups;
  const nodes = (graph.nodes ?? []).map((node) => {
    const definition = registry.get(node.type);
    const legacy = definition?.group ? definition.legacyParams : null;
    if (!legacy || !node.params) {
      return node;
    }
    const params = { ...node.params };
    const lifted = [];
    for (const [name, target] of Object.entries(legacy)) {
      if (name in params) {
        lifted.push([target, params[name]]);
        delete params[name];
      }
    }
    if (lifted.length === 0 || groups?.[definition.type]) {
      return lifted.length === 0 ? node : { ...node, params };
    }
    const copy = groupCopy(definition);
    let changed = false;
    for (const [target, value] of lifted) {
      const dot = target.indexOf(".");
      const inner = copy.nodes.find((candidate) => candidate.id === target.slice(0, dot));
      const param = target.slice(dot + 1);
      const fallback = registry.get(inner?.type)?.params?.[param]?.default;
      if (inner && value !== (inner.params?.[param] ?? fallback)) {
        inner.params = { ...inner.params, [param]: value };
        changed = true;
      }
    }
    if (changed) {
      groups = { ...groups, [definition.type]: copy };
    }
    return { ...node, params };
  });
  return groups === graph.groups ? { ...graph, nodes } : { ...graph, nodes, groups };
}

function upgradeGroups(groups, registry) {
  return Object.fromEntries(Object.entries(groups).map(([type, group]) => [type, upgradeBody(group, registry)]));
}

export function upgradeGraph(source, registry) {
  const lifted = liftLegacyParams(source, withGroups(registry, source.groups));
  registry = withGroups(registry, lifted.groups);
  const graph = lifted.groups ? { ...lifted, groups: upgradeGroups(lifted.groups, registry) } : lifted;
  const definitions = new Map();
  const nodes = (graph.nodes ?? []).map((node) => {
    const definition = registry.get(node.type);
    definitions.set(node.id, definition);
    return definition && definition.type !== node.type ? { ...node, type: definition.type } : node;
  });
  const links = (graph.links ?? []).map((link) => ({
    ...link,
    from: renameEndpoint(link.from, definitions),
    to: renameEndpoint(link.to, definitions),
  }));
  return { ...graph, ...addExecChain(nodes, links, registry) };
}

function compatible(from, to) {
  if (from === EXEC || to === EXEC) {
    return from === to;
  }
  return from === to || from === "any" || to === "any";
}

export function validateGraph(source, registry) {
  registry = withGroups(registry, source.groups);
  const graph = upgradeGraph(source, registry);
  const nodes = new Map();
  for (const node of graph.nodes ?? []) {
    if (nodes.has(node.id)) {
      throw new Error(`Duplicate node id "${node.id}"`);
    }
    const definition = registry.get(node.type);
    if (!definition) {
      throw new Error(`Node "${node.id}" has unknown type "${node.type}"`);
    }
    nodes.set(node.id, { ...node, definition, incoming: new Map(), next: new Map() });
  }

  for (const link of graph.links ?? []) {
    const from = parseEndpoint(link.from);
    const to = parseEndpoint(link.to);
    const source = nodes.get(from.node);
    const target = nodes.get(to.node);
    if (!source || !target) {
      throw new Error(`Link ${link.from} -> ${link.to} points at a missing node`);
    }
    const output = outputSpec(source.definition, from.port);
    const input = target.definition.inputs[to.port];
    if (!output) {
      throw new Error(`Node "${from.node}" has no output "${from.port}"`);
    }
    if (!input) {
      throw new Error(`Node "${to.node}" has no input "${to.port}"`);
    }
    if (!compatible(output.type, input.type)) {
      throw new Error(`Cannot connect ${link.from} (${output.type}) to ${link.to} (${input.type})`);
    }
    if (output.type === EXEC) {
      if (source.next.has(from.port)) {
        throw new Error(`${link.from} already continues to "${source.next.get(from.port)}", use a Sequence node to branch`);
      }
      source.next.set(from.port, to.node);
      continue;
    }
    const existing = target.incoming.get(to.port) ?? [];
    if (existing.length > 0 && !input.multiple) {
      throw new Error(`Input ${link.to} already has a connection`);
    }
    existing.push({ ...from, spread: Boolean(output.spread) });
    target.incoming.set(to.port, existing);
  }

  const starts = [...nodes.values()].filter((node) => node.definition.start);
  if (starts.length !== 1) {
    throw new Error(starts.length === 0 ? "The graph has no Start node" : "The graph has more than one Start node");
  }
  return { nodes, start: starts[0] };
}

function resolveParams(definition, params = {}) {
  const resolved = {};
  for (const [name, spec] of Object.entries(definition.params)) {
    const value = params[name];
    const empty = value === undefined || value === null || value === "";
    if (!empty) {
      resolved[name] = value;
    } else if (spec.default !== undefined) {
      resolved[name] = spec.default;
    } else if (spec.required) {
      throw new Error(`The "${name}" setting is required but empty`);
    }
  }
  for (const [name, value] of Object.entries(params)) {
    if (!(name in resolved)) {
      resolved[name] = value;
    }
  }
  return resolved;
}

export async function runGraph(graph, registry, options = {}) {
  const baseDir = options.baseDir ?? process.cwd();
  const log = options.log ?? ((message) => console.log(message));
  const prefix = options.idPrefix ?? "";
  const depth = options.depth ?? 0;
  const tag = (id) => prefix + id;
  const upgraded = upgradeGraph(graph, registry);
  const scoped = withGroups(registry, upgraded.groups);
  const { nodes, start } = validateGraph({ ...upgraded, groups: undefined }, scoped);
  const results = new Map();
  const computing = new Set();
  const executed = new Set();
  const gaps = new Set();

  function fail(id, error) {
    options.onNodeError?.(tag(id), error);
    error.nodeId = tag(id);
  }

  async function outputsOf(id, consumer) {
    if (results.has(id)) {
      return results.get(id);
    }
    const node = nodes.get(id);
    if (!node.definition.pure) {
      throw new Error(`"${consumer}" needs an output of "${id}", which has not run yet. Put "${id}" earlier on the white chain`);
    }
    if (computing.has(id)) {
      throw new Error(`"${id}" depends on itself`);
    }
    computing.add(id);
    try {
      return await runNode(node);
    } finally {
      computing.delete(id);
    }
  }

  function passThrough(node, inputs) {
    const outputs = {};
    const used = new Set();
    for (const [name, spec] of Object.entries(node.definition.outputs)) {
      if (spec.type === EXEC) {
        continue;
      }
      const candidates = Object.entries(node.definition.inputs).filter(
        ([inputName, input]) => input.type !== EXEC && compatible(input.type, spec.type) && inputs[inputName] !== undefined,
      );
      const match = candidates.find(([inputName]) => inputName === name) ?? candidates.find(([inputName]) => !used.has(inputName));
      const value = match && node.definition.inputs[match[0]].multiple && !spec.multiple ? inputs[match[0]][0] : match ? inputs[match[0]] : undefined;
      if (value === undefined) {
        gaps.add(`${node.id}.${name}`);
        continue;
      }
      used.add(match[0]);
      outputs[name] = value;
    }
    return outputs;
  }

  async function runGroup(node, inputs) {
    if (depth >= MAX_GROUP_DEPTH) {
      throw new Error(`Groups are nested more than ${MAX_GROUP_DEPTH} deep, a group probably contains itself`);
    }
    const collected = {};
    const inner = scoped.extend(groupIo(node.definition, inputs, collected));
    try {
      await runGraph(node.definition.group, inner, { ...options, idPrefix: `${tag(node.id)}/`, depth: depth + 1 });
    } catch (error) {
      options.onNodeError?.(tag(node.id), error);
      throw error;
    }
    return collected;
  }

  async function runNode(node) {
    const inputs = {};
    for (const [port, input] of Object.entries(node.definition.inputs)) {
      if (input.type === EXEC) {
        continue;
      }
      const sources = node.incoming.get(port) ?? [];
      if (sources.length === 0 && !input.optional && !node.muted) {
        const error = new Error(`Input ${tag(node.id)}.${port} is not connected`);
        fail(node.id, error);
        throw error;
      }
      const values = [];
      for (const from of sources) {
        let value;
        try {
          value = (await outputsOf(from.node, node.id))[from.port];
        } catch (error) {
          if (error.nodeId === undefined) {
            fail(node.id, error);
          }
          throw error;
        }
        if (gaps.has(`${from.node}.${from.port}`)) {
          if (input.optional) {
            continue;
          }
          const error = new Error(`Input ${tag(node.id)}.${port} gets nothing, because "${tag(from.node)}" is muted and has no ${from.port} to pass on`);
          fail(node.id, error);
          throw error;
        }
        if (from.spread && input.multiple) {
          values.push(...(value ?? []));
        } else if (!(from.spread && value === undefined)) {
          values.push(value);
        }
      }
      if (input.multiple) {
        inputs[port] = values;
      } else if (values.length > 0) {
        inputs[port] = values[0];
      }
    }

    const id = tag(node.id);
    const context = {
      nodeId: id,
      baseDir,
      resolve: (path) => resolvePath(baseDir, path),
      log: (message) => (options.onLog ? options.onLog(id, "info", message) : log(`[${id}] ${message}`)),
      warn: (message) => (options.onLog ? options.onLog(id, "warning", message) : log(`[${id}] warning: ${message}`)),
    };

    if (node.muted && !node.definition.start && !node.definition.end) {
      const outputs = passThrough(node, inputs);
      results.set(node.id, outputs);
      options.onNodeMuted?.(id);
      if (!options.onNodeMuted) {
        log(`[${id}] muted, passing its inputs through`);
      }
      return outputs;
    }

    const started = performance.now();
    options.onNodeStart?.(id);
    let outputs;
    try {
      const params = resolveParams(node.definition, node.params);
      outputs = node.definition.group ? await runGroup(node, inputs) : ((await node.definition.run({ inputs, params, context })) ?? {});
    } catch (error) {
      if (error.nodeId === undefined) {
        fail(node.id, error);
        error.message = `Node "${id}" (${node.type}) failed: ${error.message}`;
      }
      throw error;
    }
    results.set(node.id, outputs);
    options.onNodeDone?.(id, performance.now() - started);
    return outputs;
  }

  async function step(id) {
    if (executed.has(id)) {
      return;
    }
    executed.add(id);
    const node = nodes.get(id);
    await runNode(node);
    for (const port of execOrder(node.definition, node.next)) {
      if (node.next.has(port)) {
        await step(node.next.get(port));
      }
    }
  }

  await step(start.id);

  for (const node of nodes.values()) {
    if (!node.definition.pure && !node.definition.start && !executed.has(node.id)) {
      options.onNodeSkipped?.(tag(node.id));
      if (!options.onNodeSkipped) {
        log(`[${tag(node.id)}] skipped, not on the white chain`);
      }
    }
  }
  return results;
}
