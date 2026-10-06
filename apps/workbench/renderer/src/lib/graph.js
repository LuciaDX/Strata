import { createContext, useContext } from "react";

const PORT_COLORS = {
  pack: "var(--port-pack)",
  exclusions: "var(--port-exclusions)",
  mappings: "var(--port-mappings)",
  key: "var(--port-key)",
  rule: "var(--port-rule)",
  files: "var(--port-files)",
  exec: "var(--port-exec)",
  any: "var(--port-any)",
};

const CATEGORY_ICONS = {
  Flow: "sequence",
  Input: "folder",
  Pack: "box",
  Exclusions: "shield",
  Processing: "cog",
  Obfuscation: "incognito",
  Encryption: "lock",
  Archiving: "archive",
  Output: "save",
  Groups: "layers",
};

export function iconOf(definition) {
  return definition?.icon ?? CATEGORY_ICONS[definition?.category] ?? "puzzle";
}

export const DefinitionsContext = createContext(new Map());

export const GroupActionsContext = createContext({ open: () => {} });

export function useDefinitions() {
  return useContext(DefinitionsContext);
}

export function useGroupActions() {
  return useContext(GroupActionsContext);
}

export const PathStatesContext = createContext(new Map());

export function usePathStates() {
  return useContext(PathStatesContext);
}

export function pathProblemText(state) {
  return state === "foreign" ? "This path is from another computer" : "Not found on this computer";
}

export function isFixed(definition) {
  return Boolean(definition?.start || definition?.end);
}

export function cleanNodeName(name) {
  return name.trim().replace(/[^A-Za-z0-9 _-]+/g, "_").replace(/\s+/g, " ");
}

export function uniqueNodeId(base, existing) {
  let id = base;
  let counter = 2;
  while (existing.has(id)) {
    id = `${base}_${counter++}`;
  }
  return id;
}

export function portColor(type) {
  return PORT_COLORS[type] ?? PORT_COLORS.any;
}

export function compatible(from, to) {
  if (from === "exec" || to === "exec") {
    return from === to;
  }
  return from === to || from === "any" || to === "any";
}

export function growIndex(definition, port) {
  const prefix = definition?.growOutputs;
  if (!prefix || !port?.startsWith(prefix)) {
    return null;
  }
  const rest = port.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(rest) ? Number(rest) : null;
}

export function outputSpec(definition, port) {
  return definition?.outputs?.[port] ?? (growIndex(definition, port) !== null ? { type: "exec", optional: false } : undefined);
}

export function compactGrowEdges(edges, nodes, definitions) {
  const grow = new Map();
  for (const node of nodes) {
    const definition = definitions.get(node.data.type);
    if (definition?.growOutputs) {
      grow.set(node.id, definition);
    }
  }
  if (grow.size === 0) {
    return edges;
  }
  const renames = new Map();
  for (const [id, definition] of grow) {
    const owned = edges
      .filter((edge) => edge.source === id && growIndex(definition, edge.sourceHandle) !== null)
      .sort((a, b) => growIndex(definition, a.sourceHandle) - growIndex(definition, b.sourceHandle));
    owned.forEach((edge, index) => {
      const handle = `${definition.growOutputs}${index + 1}`;
      if (edge.sourceHandle !== handle) {
        renames.set(edge.id, handle);
      }
    });
  }
  if (renames.size === 0) {
    return edges;
  }
  return edges.map((edge) => {
    const handle = renames.get(edge.id);
    return handle ? { ...edge, sourceHandle: handle, id: `${edge.source}.${handle}->${edge.target}.${edge.targetHandle}` } : edge;
  });
}

export function isExec(port) {
  return port?.type === "exec";
}

export function dataPorts(ports) {
  return Object.entries(ports ?? {}).filter(([, port]) => !isExec(port));
}

export function execPorts(ports) {
  return Object.entries(ports ?? {}).filter(([, port]) => isExec(port));
}

export function defaultParams(definition) {
  const params = {};
  for (const [name, spec] of Object.entries(definition?.params ?? {})) {
    if (spec.default !== undefined) {
      params[name] = structuredClone(spec.default);
    }
  }
  return params;
}

export function createNodeId(type, existing) {
  return uniqueNodeId(type.split(".").pop().replace(/[^a-zA-Z0-9_]/g, "_"), existing);
}

export function makeNode(definition, position, existing, params) {
  return {
    id: createNodeId(definition.type, existing),
    type: "strata",
    position,
    deletable: !isFixed(definition),
    data: { type: definition.type, params: params ?? defaultParams(definition), status: "idle", summary: "" },
  };
}

export function makeEdge(connection, type) {
  return {
    id: `${connection.source}.${connection.sourceHandle}->${connection.target}.${connection.targetHandle}`,
    source: connection.source,
    sourceHandle: connection.sourceHandle,
    target: connection.target,
    targetHandle: connection.targetHandle,
    type: "strata",
    className: type === "exec" ? "strata-exec" : undefined,
    style: { stroke: portColor(type) },
    data: { type },
  };
}

function splitEndpoint(endpoint) {
  const dot = endpoint.lastIndexOf(".");
  return { node: endpoint.slice(0, dot), port: endpoint.slice(dot + 1) };
}

export function toStrataGraph(nodes, edges, extra = {}) {
  return {
    ...extra,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.type,
      params: node.data.params,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      ...(node.data.muted ? { muted: true } : {}),
    })),
    links: edges.map((edge) => ({
      from: `${edge.source}.${edge.sourceHandle}`,
      to: `${edge.target}.${edge.targetHandle}`,
    })),
  };
}

export function fromStrataGraph(graph, definitions) {
  const nodes = (graph.nodes ?? []).map((node, index) => ({
    id: node.id,
    type: "strata",
    position: node.position ?? { x: index * 300, y: 120 },
    deletable: !isFixed(definitions.get(node.type)),
    data: { type: node.type, params: { ...defaultParams(definitions.get(node.type)), ...node.params }, muted: Boolean(node.muted), status: "idle", summary: "" },
  }));
  const edges = (graph.links ?? []).map((link) => {
    const from = splitEndpoint(link.from);
    const to = splitEndpoint(link.to);
    const source = (graph.nodes ?? []).find((node) => node.id === from.node);
    const type = outputSpec(definitions.get(source?.type), from.port)?.type ?? "any";
    return makeEdge({ source: from.node, sourceHandle: from.port, target: to.node, targetHandle: to.port }, type);
  });
  const { nodes: _nodes, links: _links, ...extra } = graph;
  return { nodes, edges, extra };
}

export function starterGraph() {
  return {
    nodes: [
      { id: "start", type: "start", params: {}, position: { x: 40, y: 40 } },
      { id: "source", type: "source.folder", params: { path: "", exclude: [] }, position: { x: 40, y: 200 } },
      { id: "vanilla", type: "exclusions.file", params: { path: "" }, position: { x: 40, y: 360 } },
      { id: "hashKey", type: "key", params: { mode: "text", key: "" }, position: { x: 40, y: 520 } },
      { id: "obfuscate", type: "obfuscate", params: {}, position: { x: 380, y: 40 } },
      { id: "afterObfuscate", type: "sequence", params: {}, position: { x: 720, y: 40 } },
      { id: "brarchive", type: "brarchive", params: {}, position: { x: 1060, y: 40 } },
      { id: "mappings", type: "output.mappings", params: { path: "" }, position: { x: 1060, y: 260 } },
      { id: "encrypt", type: "encrypt", params: { scope: "all" }, position: { x: 1400, y: 40 } },
      { id: "contentKey", type: "key", params: { mode: "symbols", key: "" }, position: { x: 1060, y: 440 } },
      { id: "afterEncrypt", type: "sequence", params: {}, position: { x: 1740, y: 40 } },
      { id: "zip", type: "output.zip", params: { path: "" }, position: { x: 2080, y: 40 } },
      { id: "writeKey", type: "output.key", params: { path: "" }, position: { x: 2080, y: 220 } },
    ],
    links: [
      { from: "start.then", to: "obfuscate.exec" },
      { from: "obfuscate.then", to: "afterObfuscate.exec" },
      { from: "afterObfuscate.then1", to: "brarchive.exec" },
      { from: "afterObfuscate.then2", to: "mappings.exec" },
      { from: "brarchive.then", to: "encrypt.exec" },
      { from: "encrypt.then", to: "afterEncrypt.exec" },
      { from: "afterEncrypt.then1", to: "zip.exec" },
      { from: "afterEncrypt.then2", to: "writeKey.exec" },
      { from: "source.pack", to: "obfuscate.pack" },
      { from: "vanilla.exclusions", to: "obfuscate.exclusions" },
      { from: "hashKey.key", to: "obfuscate.key" },
      { from: "obfuscate.pack", to: "brarchive.pack" },
      { from: "obfuscate.mappings", to: "mappings.mappings" },
      { from: "brarchive.pack", to: "encrypt.pack" },
      { from: "contentKey.key", to: "encrypt.key" },
      { from: "contentKey.key", to: "writeKey.key" },
      { from: "encrypt.pack", to: "zip.pack" },
    ],
  };
}

export function dirnameOf(path) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? null : path.slice(0, index);
}

export function basenameOf(path) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(index + 1);
}
