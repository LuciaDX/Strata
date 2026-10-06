import { isAbsolutePath, joinPath, portablePath, relativePath } from "@strata/core/paths";

const MAX_UP = 2;

export function pathParams(definition) {
  return Object.entries(definition?.params ?? {}).filter(([, spec]) => spec.type === "file" || spec.type === "folder");
}

export function pathEntries(nodes, definitionMap) {
  const entries = [];
  for (const node of nodes) {
    for (const [param, spec] of pathParams(definitionMap.get(node.data.type))) {
      const path = node.data.params?.[param];
      if (typeof path === "string" && path.trim() !== "") {
        entries.push({ node: node.id, param, path, output: spec.mode === "save" });
      }
    }
  }
  return entries;
}

function portable(path, fromDir, toDir) {
  if (typeof path !== "string" || path.trim() === "") {
    return path;
  }
  const absolute = joinPath(fromDir, path);
  if (!isAbsolutePath(absolute)) {
    return portablePath(path);
  }
  return relativePath(toDir, absolute, MAX_UP) ?? absolute;
}

function portableNodes(nodes, definitionMap, fromDir, toDir) {
  return nodes.map((node) => {
    const params = pathParams(definitionMap.get(node.type));
    if (params.length === 0 || !node.params) {
      return node;
    }
    const next = { ...node.params };
    for (const [name] of params) {
      next[name] = portable(next[name], fromDir, toDir);
    }
    return { ...node, params: next };
  });
}

export function portableGraph(graph, definitionMap, fromDir, toDir) {
  const result = { ...graph, nodes: portableNodes(graph.nodes, definitionMap, fromDir, toDir) };
  if (graph.plugins) {
    result.plugins = graph.plugins.map((path) => portable(path, fromDir, toDir));
  }
  if (graph.groups) {
    result.groups = Object.fromEntries(
      Object.entries(graph.groups).map(([type, group]) => [type, { ...group, nodes: portableNodes(group.nodes ?? [], definitionMap, fromDir, toDir) }]),
    );
  }
  return result;
}
