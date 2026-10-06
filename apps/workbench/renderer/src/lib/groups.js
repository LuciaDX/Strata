import { defaultParams } from "./graph.js";

export const GROUP_INPUT = "group.input";
export const GROUP_OUTPUT = "group.output";

function normalizePorts(ports = {}) {
  const normalized = {};
  for (const [name, spec] of Object.entries(ports)) {
    normalized[name] = typeof spec === "string" ? { type: spec, optional: false } : { optional: false, ...spec };
  }
  return normalized;
}

function hasExec(ports) {
  return Object.values(ports).some((spec) => spec.type === "exec");
}

function dataEntries(ports) {
  return Object.entries(ports ?? {}).filter(([, spec]) => spec.type !== "exec");
}

export function groupDefinition(type, group, template) {
  const inputs = normalizePorts(group.inputs ?? template?.inputs);
  const outputs = normalizePorts(group.outputs ?? template?.outputs);
  return {
    params: {},
    source: null,
    ...template,
    type,
    title: group.title ?? template?.title ?? type,
    icon: group.icon ?? template?.icon ?? null,
    category: group.category ?? template?.category ?? "Groups",
    description: group.description ?? template?.description ?? "",
    inputs: hasExec(inputs) ? inputs : { exec: { type: "exec", optional: true, multiple: true }, ...inputs },
    outputs: hasExec(outputs) ? outputs : { then: { type: "exec", optional: false }, ...outputs },
    pure: false,
    start: false,
    group: { nodes: group.nodes ?? [], links: group.links ?? [] },
    local: true,
  };
}

export function groupIoDefinitions(definition) {
  const inputs = Object.fromEntries(dataEntries(definition.inputs).map(([name, spec]) => [name, { ...spec, optional: true, multiple: false }]));
  const outputs = Object.fromEntries(dataEntries(definition.outputs).map(([name, spec]) => [name, { type: spec.type, optional: true }]));
  const shared = { category: "Groups", params: {}, pure: false, growOutputs: null, source: null, group: null };
  return [
    {
      ...shared,
      type: GROUP_INPUT,
      title: "Group Input",
      icon: "login",
      description: `Values passed into ${definition.title}`,
      start: true,
      inputs: {},
      outputs: { then: { type: "exec", optional: false }, ...inputs },
    },
    {
      ...shared,
      type: GROUP_OUTPUT,
      title: "Group Output",
      icon: "logout",
      description: `Values ${definition.title} passes on`,
      start: false,
      end: true,
      inputs: { exec: { type: "exec", optional: true, multiple: true }, ...outputs },
      outputs: {},
    },
  ];
}

export function buildDefinitionMap(definitions, groups, currentType) {
  const map = new Map(definitions.map((definition) => [definition.type, definition]));
  for (const [type, group] of Object.entries(groups)) {
    map.set(type, groupDefinition(type, group, map.get(type)));
  }
  const current = currentType ? map.get(currentType) : null;
  if (current?.group) {
    for (const io of groupIoDefinitions(current)) {
      map.set(io.type, io);
    }
  }
  return map;
}

export function isFixedNode(definition) {
  return Boolean(definition?.start || definition?.type === GROUP_OUTPUT);
}

export function groupCopyOf(definition) {
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

function bodyKey(body, map) {
  const nodes = body.nodes
    .map((node) => ({
      id: node.id,
      type: node.type,
      params: { ...defaultParams(map.get(node.type)), ...node.params },
      muted: Boolean(node.muted),
      position: { x: Math.round(node.position?.x ?? 0), y: Math.round(node.position?.y ?? 0) },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const links = body.links.map((link) => `${link.from}>${link.to}`).sort();
  return JSON.stringify({ nodes, links });
}

export function matchesTemplate(body, template, map) {
  return Boolean(template?.group) && !template.local && bodyKey(body, map) === bodyKey(template.group, map);
}

export function usedGroups(rootNodes, groups) {
  const used = new Set();
  const pending = rootNodes.map((node) => node.type);
  while (pending.length > 0) {
    const type = pending.pop();
    if (used.has(type) || !groups[type]) {
      continue;
    }
    used.add(type);
    pending.push(...(groups[type].nodes ?? []).map((node) => node.type));
  }
  return Object.fromEntries(Object.entries(groups).filter(([type]) => used.has(type)));
}
