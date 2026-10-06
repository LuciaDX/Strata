import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "@xyflow/react";
import { StrataNode } from "./components/StrataNode.jsx";
import { ConnectionLine, StrataEdge } from "./components/StrataEdge.jsx";
import { Library } from "./components/Library.jsx";
import { Inspector } from "./components/Inspector.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { LogPanel } from "./components/LogPanel.jsx";
import { DragGhost, GHOST_ANCHOR } from "./components/DragGhost.jsx";
import { CutStroke } from "./components/CutStroke.jsx";
import { Splash } from "./components/Splash.jsx";
import { TooltipLayer } from "./components/Tooltip.jsx";
import { Icon } from "./components/Icon.jsx";
import { tip } from "./lib/tooltip.js";
import { useCutTool } from "./lib/useCutTool.js";
import { useHistory } from "./lib/useHistory.js";
import { buildDefinitionMap, groupCopyOf, matchesTemplate, usedGroups } from "./lib/groups.js";
import { applyRelink, describeRule, isAbsolutePath, isInside, joinPath, relinkRule } from "@strata/core/paths";
import { pathEntries, portableGraph } from "./lib/paths.js";
import {
  DefinitionsContext,
  GroupActionsContext,
  PathStatesContext,
  pathProblemText,
  cleanNodeName,
  compactGrowEdges,
  outputSpec,
  uniqueNodeId,
  basenameOf,
  compatible,
  defaultParams,
  isFixed,
  dirnameOf,
  fromStrataGraph,
  makeEdge,
  makeNode,
  starterGraph,
  toStrataGraph,
} from "./lib/graph.js";
import styles from "./App.module.css";

const nodeTypes = { strata: StrataNode };
const edgeTypes = { strata: StrataEdge };

const SPLASH_MIN_TIME = 1500;

const GRID = 31;

const CLIPBOARD_FORMAT = "strata-clipboard";

const FIT_PADDING = { top: "110px", right: "370px", bottom: "100px", left: "310px" };

const GRAPH_FILTERS = [{ name: "Strata graph", extensions: ["json"] }];

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function scopePrefix(scope) {
  return scope.map((level) => `${level.nodeId}/`).join("");
}

function endpointNode(endpoint) {
  return endpoint.slice(0, endpoint.lastIndexOf("."));
}

function parseClipboard(text) {
  try {
    const payload = JSON.parse(text);
    return payload?.format === CLIPBOARD_FORMAT && Array.isArray(payload.nodes) ? payload : null;
  } catch {
    return null;
  }
}

function splitGroups(extra) {
  const { groups = {}, ...rest } = extra;
  return { groups, rest };
}

function Workbench() {
  const flow = useReactFlow();
  const [definitions, setDefinitions] = useState([]);
  const [pluginFolder, setPluginFolder] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [extra, setExtra] = useState({});
  const [groups, setGroups] = useState({});
  const [scope, setScope] = useState([]);
  const prefixRef = useRef("");
  const statusRef = useRef(new Map());
  const runningRef = useRef(false);
  const pendingFit = useRef(false);
  const pointerRef = useRef(null);
  const clipboardRef = useRef(null);
  const [filePath, setFilePath] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [runStatus, setRunStatus] = useState("idle");
  const [runTime, setRunTime] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [pathStates, setPathStates] = useState(new Map());
  const [pathTick, setPathTick] = useState(0);
  const announceRef = useRef(false);
  const [drag, setDrag] = useState(null);
  const logKey = useRef(0);
  const canvasRef = useRef(null);
  const markEdited = useCallback(() => setDirty(true), []);
  const history = useHistory(nodes, edges, setNodes, setEdges, markEdited);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const booted = nodesLoaded && fontsReady && introDone;
  const bootStatus = !nodesLoaded ? "Loading nodes" : !fontsReady ? "Loading fonts" : "Preparing workbench";
  const cut = useCutTool(canvasRef, (ids) => flow.deleteElements({ edges: ids.map((id) => ({ id })) }));

  const currentType = scope.at(-1)?.type ?? null;
  const baseMap = useMemo(() => new Map(definitions.map((definition) => [definition.type, definition])), [definitions]);
  const definitionMap = useMemo(() => buildDefinitionMap(definitions, groups, currentType), [currentType, definitions, groups]);

  const baseDir = filePath ? dirnameOf(filePath) : null;
  const watchedPaths = useMemo(() => pathEntries(nodes, definitionMap), [nodes, definitionMap]);
  const watchKey = JSON.stringify([baseDir, pathTick, watchedPaths]);

  const addLog = useCallback((id, level, message) => {
    setLogs((list) => [...list.slice(-999), { key: logKey.current++, time: timestamp(), id, level, message }]);
  }, []);

  const updateNodeData = useCallback(
    (id, patch) => {
      setNodes((list) => list.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)));
    },
    [setNodes],
  );

  const applyStatus = useCallback(
    (fullId, patch) => {
      const previous = statusRef.current.get(fullId) ?? {};
      const next = { ...previous, ...(typeof patch === "function" ? patch(previous) : patch) };
      statusRef.current.set(fullId, next);
      const prefix = prefixRef.current;
      if (!fullId.startsWith(prefix) || fullId.slice(prefix.length).includes("/")) {
        return;
      }
      updateNodeData(fullId.slice(prefix.length), next);
    },
    [updateNodeData],
  );

  const withStatuses = useCallback((list, prefix) => {
    const fallback = runningRef.current ? { status: "queued", summary: "", warned: false } : { status: "idle", summary: "", warned: false };
    return list.map((node) => ({ ...node, data: { ...node.data, ...fallback, ...statusRef.current.get(prefix + node.id) } }));
  }, []);

  const loadGraph = useCallback(
    (graph, list, path) => {
      const { groups: loadedGroups, rest } = splitGroups(graph);
      const loaded = fromStrataGraph(rest, buildDefinitionMap(list, loadedGroups, null));
      history.reset();
      statusRef.current = new Map();
      prefixRef.current = "";
      setGroups(loadedGroups);
      setScope([]);
      setNodes(loaded.nodes);
      setEdges(loaded.edges);
      setExtra(loaded.extra);
      setFilePath(path);
      setDirty(false);
      setSelectedId(null);
      setRunStatus("idle");
      setRunTime(null);
      pendingFit.current = true;
    },
    [history.reset, setNodes, setEdges],
  );

  useEffect(() => {
    window.strata
      .listNodes()
      .then((result) => {
        setDefinitions(result.nodes);
        setPluginFolder(result.pluginFolder);
        loadGraph(starterGraph(), result.nodes, null);
      })
      .catch((error) => addLog(null, "error", `could not load nodes: ${error.message}`))
      .finally(() => setNodesLoaded(true));
  }, [addLog, loadGraph]);

  useEffect(() => {
    const [dir, , entries] = JSON.parse(watchKey);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const states = entries.length > 0 ? await window.strata.checkPaths(dir, entries.map(({ path, output }) => ({ path, output }))) : [];
      if (cancelled) {
        return;
      }
      const next = new Map();
      entries.forEach((entry, index) => {
        if (states[index] !== "ok") {
          next.set(entry.node, { ...next.get(entry.node), [entry.param]: states[index] });
        }
      });
      setPathStates(next);
      if (announceRef.current) {
        announceRef.current = false;
        entries.forEach((entry, index) => {
          if (states[index] !== "ok") {
            addLog(`${prefixRef.current}${entry.node}`, "warning", `${pathProblemText(states[index]).toLowerCase()}: ${entry.path}`);
          }
        });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addLog, watchKey]);

  useEffect(() => {
    const recheck = () => setPathTick((tick) => tick + 1);
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, []);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
    const timer = setTimeout(() => setIntroDone(true), SPLASH_MIN_TIME);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const compacted = compactGrowEdges(edges, nodes, definitionMap);
    if (compacted !== edges) {
      setEdges(compacted);
    }
  }, [definitionMap, edges, nodes, setEdges]);

  const clearQueued = useCallback(() => {
    runningRef.current = false;
    setNodes((list) => list.map((node) => (node.data.status === "queued" ? { ...node, data: { ...node.data, status: "idle" } } : node)));
  }, [setNodes]);

  useEffect(
    () =>
      window.strata.onRunEvent((event) => {
        if (event.type === "start") {
          applyStatus(event.id, { status: "running" });
        } else if (event.type === "done") {
          applyStatus(event.id, (previous) => ({ status: previous.warned ? "warning" : "done" }));
          addLog(event.id, "success", `done in ${Math.round(event.ms)} ms`);
        } else if (event.type === "error") {
          applyStatus(event.id, { status: "failed" });
        } else if (event.type === "muted") {
          applyStatus(event.id, { status: "muted" });
        } else if (event.type === "skipped") {
          applyStatus(event.id, { status: "skipped" });
        } else if (event.type === "log") {
          addLog(event.id, event.level, event.message);
          applyStatus(event.id, event.level === "warning" ? { warned: true } : { summary: event.message });
        } else if (event.type === "finished") {
          clearQueued();
          setRunStatus("done");
          setRunTime(event.ms);
          addLog(null, "success", `finished in ${(event.ms / 1000).toFixed(2)} s`);
        } else if (event.type === "stopped") {
          clearQueued();
          for (const [id, status] of statusRef.current) {
            if (status.status === "running") {
              statusRef.current.set(id, { ...status, status: "idle" });
            }
          }
          setNodes((list) => list.map((node) => (node.data.status === "running" ? { ...node, data: { ...node.data, status: "idle" } } : node)));
          setRunStatus("stopped");
          setRunTime(event.ms);
          addLog(null, "warning", "run stopped");
        } else if (event.type === "failed") {
          clearQueued();
          setRunStatus("failed");
          addLog(event.id, "error", event.message);
          if (event.id) {
            applyStatus(event.id, { status: "failed" });
          }
        }
      }),
    [addLog, applyStatus, clearQueued, setNodes],
  );

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      if (changes.some((change) => change.type === "position" || change.type === "remove" || change.type === "add")) {
        setDirty(true);
      }
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      if (changes.some((change) => change.type === "remove" || change.type === "add")) {
        setDirty(true);
      }
    },
    [onEdgesChange],
  );

  const portsOf = useCallback(
    (connection) => {
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      return {
        output: outputSpec(definitionMap.get(source?.data.type), connection.sourceHandle),
        input: definitionMap.get(target?.data.type)?.inputs?.[connection.targetHandle],
      };
    },
    [nodes, definitionMap],
  );

  const isValidConnection = useCallback(
    (connection) => {
      if (connection.source === connection.target) {
        return false;
      }
      const { output, input } = portsOf(connection);
      return Boolean(output && input && compatible(output.type, input.type));
    },
    [portsOf],
  );

  const onConnect = useCallback(
    (connection) => {
      const { output, input } = portsOf(connection);
      const edge = makeEdge(connection, output?.type ?? "any");
      setEdges((list) => {
        const singleOut = output?.type === "exec";
        const kept = list.filter(
          (existing) =>
            !(!input?.multiple && existing.target === connection.target && existing.targetHandle === connection.targetHandle) &&
            !(singleOut && existing.source === connection.source && existing.sourceHandle === connection.sourceHandle),
        );
        return kept.some((existing) => existing.id === edge.id) ? kept : [...kept, edge];
      });
      setDirty(true);
    },
    [portsOf, setEdges],
  );

  const addNode = useCallback(
    (type, position, params) => {
      const definition = definitionMap.get(type);
      if (!definition) {
        return null;
      }
      let created = null;
      setNodes((list) => {
        created = makeNode(definition, position, new Set(list.map((node) => node.id)), params ? { ...defaultParams(definition), ...params } : undefined);
        return [...list.map((node) => ({ ...node, selected: false })), { ...created, selected: true }];
      });
      setDirty(true);
      return created;
    },
    [definitionMap, setNodes],
  );

  const pickUp = useCallback(
    (definition, event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      let active = false;

      function overCanvas(x, y) {
        const target = document.elementFromPoint(x, y);
        return Boolean(target) && Boolean(canvasRef.current?.contains(target));
      }

      function onMove(moveEvent) {
        if (!active && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 4) {
          return;
        }
        active = true;
        document.body.style.cursor = "grabbing";
        const over = overCanvas(moveEvent.clientX, moveEvent.clientY);
        setDrag({ definition, x: moveEvent.clientX, y: moveEvent.clientY, overCanvas: over, scale: over ? flow.getZoom() : 0.85 });
      }

      function finish(endEvent, cancelled) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("keydown", onKey);
        document.body.style.cursor = "";
        setDrag(null);
        if (!active || cancelled || !overCanvas(endEvent.clientX, endEvent.clientY)) {
          return;
        }
        const zoom = flow.getZoom();
        addNode(definition.type, flow.screenToFlowPosition({ x: endEvent.clientX - GHOST_ANCHOR.x * zoom, y: endEvent.clientY - GHOST_ANCHOR.y * zoom }));
      }

      function onUp(upEvent) {
        finish(upEvent, false);
      }

      function onKey(keyEvent) {
        if (keyEvent.key === "Escape") {
          finish(keyEvent, true);
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("keydown", onKey);
    },
    [addNode, flow],
  );

  const selectNode = useCallback(
    (fullId) => {
      const prefix = prefixRef.current;
      if (!fullId?.startsWith(prefix)) {
        return;
      }
      const id = fullId.slice(prefix.length).split("/")[0];
      if (!nodes.some((node) => node.id === id)) {
        return;
      }
      setNodes((list) => list.map((node) => ({ ...node, selected: node.id === id })));
      setSelectedId(id);
      flow.fitView({ nodes: [{ id }], padding: FIT_PADDING, duration: 300, maxZoom: 1 });
    },
    [flow, nodes, setNodes],
  );

  const foldScope = useCallback(
    (depth) => {
      const nextGroups = { ...groups };
      let currentNodes = nodes;
      let currentEdges = edges;
      for (let index = scope.length - 1; index >= depth; index--) {
        const level = scope[index];
        const body = toStrataGraph(currentNodes, currentEdges);
        const merged = { ...nextGroups[level.type], nodes: body.nodes, links: body.links };
        if (matchesTemplate(merged, baseMap.get(level.type), buildDefinitionMap(definitions, nextGroups, level.type))) {
          delete nextGroups[level.type];
        } else {
          nextGroups[level.type] = merged;
        }
        currentNodes = level.nodes;
        currentEdges = level.edges;
      }
      return { nodes: currentNodes, edges: currentEdges, groups: nextGroups };
    },
    [baseMap, definitions, edges, groups, nodes, scope],
  );

  const documentGraph = useCallback(() => {
    const folded = foldScope(0);
    const graph = toStrataGraph(folded.nodes, folded.edges, extra);
    const kept = usedGroups(graph.nodes, folded.groups);
    return Object.keys(kept).length > 0 ? { ...graph, groups: kept } : graph;
  }, [extra, foldScope]);

  const enterGroup = useCallback(
    (nodeId) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      const definition = node ? definitionMap.get(node.data.type) : null;
      if (!definition?.group) {
        return;
      }
      if (scope.some((level) => level.type === definition.type)) {
        addLog(null, "warning", `${definition.title} is already open, a group cannot contain itself`);
        return;
      }
      const group = groups[definition.type] ?? groupCopyOf(definition);
      const nextGroups = { ...groups, [definition.type]: group };
      const nextScope = [...scope, { type: definition.type, nodeId, title: definition.title, nodes, edges, viewport: flow.getViewport() }];
      const loaded = fromStrataGraph({ nodes: group.nodes, links: group.links }, buildDefinitionMap(definitions, nextGroups, definition.type));
      prefixRef.current = scopePrefix(nextScope);
      history.reset();
      setGroups(nextGroups);
      setScope(nextScope);
      setNodes(withStatuses(loaded.nodes, prefixRef.current));
      setEdges(loaded.edges);
      setSelectedId(null);
      pendingFit.current = true;
    },
    [addLog, definitionMap, definitions, edges, flow, groups, history.reset, nodes, scope, setEdges, setNodes, withStatuses],
  );

  const exitTo = useCallback(
    (depth) => {
      if (depth >= scope.length) {
        return;
      }
      const folded = foldScope(depth);
      const level = scope[depth];
      const nextScope = scope.slice(0, depth);
      prefixRef.current = scopePrefix(nextScope);
      history.reset();
      setGroups(folded.groups);
      setScope(nextScope);
      setNodes(withStatuses(folded.nodes.map((node) => ({ ...node, selected: node.id === level.nodeId })), prefixRef.current));
      setEdges(folded.edges);
      setSelectedId(level.nodeId);
      requestAnimationFrame(() => flow.setViewport(level.viewport, { duration: 300 }));
    },
    [flow, foldScope, history.reset, scope, setEdges, setNodes, withStatuses],
  );

  const resetGroup = useCallback(
    (type) => {
      setGroups((current) => {
        const next = { ...current };
        delete next[type];
        return next;
      });
      setDirty(true);
      addLog(null, "info", `${baseMap.get(type)?.title ?? type} reset to the plugin version`);
    },
    [addLog, baseMap],
  );

  useEffect(() => {
    if (pendingFit.current && nodes.length > 0 && nodes.every((node) => node.measured?.width)) {
      pendingFit.current = false;
      flow.fitView({ padding: FIT_PADDING, duration: 300, maxZoom: 1 });
    }
  }, [flow, nodes]);

  const toggleMute = useCallback(
    (ids) => {
      const targets = nodes.filter((node) => (ids ? ids.includes(node.id) : node.selected) && !isFixed(definitionMap.get(node.data.type)));
      if (targets.length === 0) {
        return;
      }
      const mute = targets.some((node) => !node.data.muted);
      const chosen = new Set(targets.map((node) => node.id));
      setNodes((list) => list.map((node) => (chosen.has(node.id) ? { ...node, data: { ...node.data, muted: mute } } : node)));
      setDirty(true);
    },
    [definitionMap, nodes, setNodes],
  );

  const copySelection = useCallback(() => {
    const picked = nodes.filter((node) => node.selected && !isFixed(definitionMap.get(node.data.type)));
    if (picked.length === 0) {
      return null;
    }
    const ids = new Set(picked.map((node) => node.id));
    const graph = toStrataGraph(picked, edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)));
    const kept = usedGroups(graph.nodes, groups);
    return { format: CLIPBOARD_FORMAT, nodes: graph.nodes, links: graph.links, ...(Object.keys(kept).length > 0 ? { groups: kept } : {}) };
  }, [definitionMap, edges, groups, nodes]);

  const pastePayload = useCallback(
    (payload, offset) => {
      const open = new Set(scope.map((level) => level.type));
      const nextGroups = { ...groups };
      for (const [type, group] of Object.entries(payload.groups ?? {})) {
        if (!nextGroups[type] && !open.has(type)) {
          nextGroups[type] = group;
        }
      }
      const map = buildDefinitionMap(definitions, nextGroups, currentType);
      const pasted = payload.nodes.filter((node) => !open.has(node.type) && !isFixed(map.get(node.type)));
      if (pasted.length < payload.nodes.length) {
        addLog(null, "warning", "skipped nodes that cannot be pasted here, such as Start or the group you are in");
      }
      if (pasted.length === 0) {
        return;
      }
      const taken = new Set(nodes.map((node) => node.id));
      const rename = new Map();
      for (const node of pasted) {
        const id = uniqueNodeId(node.id, taken);
        taken.add(id);
        rename.set(node.id, id);
      }
      const left = Math.min(...pasted.map((node) => node.position?.x ?? 0));
      const top = Math.min(...pasted.map((node) => node.position?.y ?? 0));
      const origin = offset
        ? { x: left + offset, y: top + offset }
        : pointerRef.current
          ? flow.screenToFlowPosition(pointerRef.current)
          : { x: left + GRID * 2, y: top + GRID * 2 };
      const moved = (endpoint) => `${rename.get(endpointNode(endpoint))}${endpoint.slice(endpoint.lastIndexOf("."))}`;
      const loaded = fromStrataGraph(
        {
          nodes: pasted.map((node) => ({
            ...node,
            id: rename.get(node.id),
            position: { x: origin.x + (node.position?.x ?? 0) - left, y: origin.y + (node.position?.y ?? 0) - top },
          })),
          links: (payload.links ?? [])
            .filter((link) => rename.has(endpointNode(link.from)) && rename.has(endpointNode(link.to)))
            .map((link) => ({ from: moved(link.from), to: moved(link.to) })),
        },
        map,
      );
      setGroups(nextGroups);
      setNodes((list) => [...list.map((node) => ({ ...node, selected: false })), ...loaded.nodes.map((node) => ({ ...node, selected: true }))]);
      setEdges((list) => [...list.map((edge) => ({ ...edge, selected: false })), ...loaded.edges]);
      setDirty(true);
    },
    [addLog, currentType, definitions, flow, groups, nodes, scope, setEdges, setNodes],
  );

  const handleCopy = useCallback(() => {
    const payload = copySelection();
    if (!payload) {
      return;
    }
    clipboardRef.current = payload;
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
    addLog(null, "info", `copied ${payload.nodes.length} node${payload.nodes.length === 1 ? "" : "s"}`);
  }, [addLog, copySelection]);

  const handlePaste = useCallback(async () => {
    let payload = null;
    try {
      payload = parseClipboard(await navigator.clipboard.readText());
    } catch {
      payload = null;
    }
    payload ??= clipboardRef.current;
    if (payload) {
      pastePayload(payload, null);
    }
  }, [pastePayload]);

  const handleDuplicate = useCallback(() => {
    const payload = copySelection();
    if (payload) {
      pastePayload(payload, GRID * 2);
    }
  }, [copySelection, pastePayload]);

  const groupActions = useMemo(() => ({ open: enterGroup }), [enterGroup]);

  const openGraphFile = useCallback(
    async (path) => {
      try {
        const graph = await window.strata.upgradeGraph(JSON.parse(await window.strata.readFile(path)), dirnameOf(path));
        loadGraph(graph, definitions, path);
        announceRef.current = true;
        addLog(null, "info", `opened ${path}`);
      } catch (error) {
        addLog(null, "error", `could not open ${path}: ${error.message}`);
      }
    },
    [addLog, definitions, loadGraph],
  );

  const handleNew = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    loadGraph(starterGraph(), definitions, null);
  }, [dirty, definitions, loadGraph]);

  const handleOpen = useCallback(async () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    const result = await window.strata.openDialog({ properties: ["openFile"], filters: GRAPH_FILTERS });
    if (!result.canceled) {
      await openGraphFile(result.filePaths[0]);
    }
  }, [dirty, openGraphFile]);

  const handleSave = useCallback(async () => {
    let path = filePath;
    if (!path) {
      const result = await window.strata.saveDialog({ defaultPath: "graph.strata.json", filters: GRAPH_FILTERS });
      if (result.canceled) {
        return;
      }
      path = result.filePath;
    }
    const graph = portableGraph(documentGraph(), baseMap, baseDir, dirnameOf(path));
    await window.strata.writeFile(path, JSON.stringify(graph, null, 2) + "\n");
    setFilePath(path);
    setDirty(false);
    addLog(null, "info", `saved ${path}`);
    return path;
  }, [addLog, baseDir, baseMap, documentGraph, filePath]);

  const setPathParams = useCallback(
    (changes) => {
      setNodes((list) =>
        list.map((node) => {
          const own = changes.filter((change) => change.node === node.id);
          if (own.length === 0) {
            return node;
          }
          const params = { ...node.data.params };
          for (const change of own) {
            params[change.param] = change.path;
          }
          return { ...node, data: { ...node.data, params } };
        }),
      );
      setDirty(true);
    },
    [setNodes],
  );

  const browsePath = useCallback(
    async (nodeId, param, picked) => {
      const old = nodes.find((node) => node.id === nodeId)?.data.params?.[param];
      setPathParams([{ node: nodeId, param, path: picked }]);
      if (!old || !pathStates.get(nodeId)?.[param]) {
        return;
      }
      const rule = relinkRule(joinPath(baseDir, old), picked);
      const candidates = watchedPaths
        .filter((entry) => !(entry.node === nodeId && entry.param === param) && pathStates.get(entry.node)?.[entry.param])
        .map((entry) => ({ ...entry, path: applyRelink(rule, joinPath(baseDir, entry.path)) }))
        .filter((entry) => entry.path);
      if (candidates.length === 0) {
        return;
      }
      const states = await window.strata.checkPaths(baseDir, candidates.map(({ path, output }) => ({ path, output })));
      const found = candidates.filter((entry, index) => states[index] === "ok");
      if (found.length === 0) {
        return;
      }
      const { from, to } = describeRule(rule);
      const count = found.length === 1 ? "1 other missing path" : `${found.length} other missing paths`;
      if (!window.confirm(`${count} can be found the same way:\n\n${from}\n→ ${to}\n\nRelink them too?`)) {
        return;
      }
      setPathParams(found);
      addLog(null, "success", `relinked ${found.length + 1} paths from ${from} to ${to}`);
    },
    [addLog, baseDir, nodes, pathStates, setPathParams, watchedPaths],
  );

  const handleCollect = useCallback(async () => {
    if (scope.length > 0) {
      addLog(null, "warning", "go back to the graph to collect its files");
      return;
    }
    const path = filePath ?? (await handleSave());
    if (!path) {
      return;
    }
    const dir = dirnameOf(path);
    const outside = watchedPaths.filter((entry) => {
      const absolute = joinPath(dir, entry.path);
      return isAbsolutePath(absolute) && !isInside(dir, absolute) && !pathStates.get(entry.node)?.[entry.param];
    });
    const skipped = watchedPaths.filter((entry) => !entry.output && pathStates.get(entry.node)?.[entry.param]).length;
    if (outside.length === 0) {
      addLog(null, "info", skipped > 0 ? `nothing to collect, ${skipped} missing paths need choosing again first` : "every file is already next to the graph");
      return;
    }
    const lines = outside.slice(0, 10).map((entry) => `${entry.output ? "write here" : "copy"}  ${entry.path}`);
    const more = outside.length > lines.length ? `\n…and ${outside.length - lines.length} more` : "";
    if (!window.confirm(`Collect into ${dir}?\n\n${lines.join("\n")}${more}\n\nOutputs are not copied, only pointed to the graph folder.`)) {
      return;
    }
    setCollecting(true);
    try {
      const results = await window.strata.collectPaths(dir, outside.map((entry) => ({ path: joinPath(dir, entry.path), output: entry.output })));
      setPathParams(outside.map((entry, index) => ({ ...entry, path: results[index].path })));
      const copied = new Set(results.filter((result) => result.copied).map((result) => result.path)).size;
      addLog(null, "success", `copied ${copied} into ${dir} and moved ${outside.length} paths, save to keep them`);
      if (skipped > 0) {
        addLog(null, "warning", `${skipped} missing paths were left as they are`);
      }
    } catch (error) {
      addLog(null, "error", `could not collect files: ${error.message}`);
    } finally {
      setCollecting(false);
    }
  }, [addLog, filePath, handleSave, pathStates, scope.length, setPathParams, watchedPaths]);

  useEffect(() => {
    function onKeyDown(event) {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") {
        event.preventDefault();
        handleSave();
        return;
      }
      const typing = event.target.closest?.("input, textarea, select, [contenteditable=true]");
      if (typing) {
        return;
      }
      if (key === "tab" && !mod && !event.altKey) {
        event.preventDefault();
        if (definitionMap.get(nodes.find((node) => node.id === selectedId)?.data.type)?.group) {
          enterGroup(selectedId);
        } else if (scope.length > 0) {
          exitTo(scope.length - 1);
        }
        return;
      }
      if (key === "m" && !mod && !event.altKey) {
        toggleMute();
        return;
      }
      if (!mod) {
        return;
      }
      if (key === "c") {
        handleCopy();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        handlePaste();
        return;
      }
      if (key === "d") {
        event.preventDefault();
        handleDuplicate();
        return;
      }
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        history.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        history.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [definitionMap, enterGroup, exitTo, handleCopy, handleDuplicate, handlePaste, handleSave, history.redo, history.undo, nodes, scope.length, selectedId, toggleMute]);

  const handleRun = useCallback(async () => {
    setRunStatus("running");
    setRunTime(null);
    setLogOpen(true);
    statusRef.current = new Map();
    runningRef.current = true;
    setNodes((list) => list.map((node) => ({ ...node, data: { ...node.data, status: "queued", summary: "", warned: false } })));
    addLog(null, "info", "run started");
    await window.strata.runGraph(documentGraph(), filePath ? dirnameOf(filePath) : null);
  }, [addLog, documentGraph, filePath, setNodes]);

  const handleScan = useCallback(async () => {
    const folder = await window.strata.openDialog({ title: "Folder with the packs to scan", properties: ["openDirectory"] });
    if (folder.canceled) {
      return;
    }
    const source = folder.filePaths[0];
    const name = basenameOf(source);
    const output = await window.strata.saveDialog({
      title: "Save the exclusion file",
      defaultPath: `${name}.exclusions.json`,
      filters: [{ name: "Strata exclusions", extensions: ["json"] }],
    });
    if (output.canceled) {
      return;
    }
    setScanning(true);
    setLogOpen(true);
    addLog(null, "info", `scanning ${source}`);
    const unsubscribe = window.strata.onScanProgress((pack) => addLog(null, "info", `scanned ${pack.name}${pack.version ? " " + pack.version : ""}`));
    try {
      const result = await window.strata.scanPacks(source, output.filePath, name);
      const version = result.meta.gameVersion ? ` ${result.meta.gameVersion}` : "";
      addLog(null, "success", `${result.meta.name}${version}: ${result.meta.packs.length} packs, ${result.counts.paths} paths, saved ${output.filePath}`);
    } catch (error) {
      addLog(null, "error", `scan failed: ${error.message}`);
    } finally {
      unsubscribe();
      setScanning(false);
    }
  }, [addLog]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    async (event) => {
      event.preventDefault();
      const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const files = [...event.dataTransfer.files];
      for (const [index, file] of files.entries()) {
        const path = window.strata.pathForFile(file);
        if (!path) {
          continue;
        }
        const at = { x: position.x + index * 40, y: position.y + index * 40 };
        if (path.toLowerCase().endsWith(".json")) {
          const info = await window.strata.inspectFile(path);
          if (info.kind === "exclusions") {
            addNode("exclusions.file", at, { path });
            addLog(null, "info", `added exclusions ${info.meta.name ?? basenameOf(path)}`);
          } else if (info.kind === "graph") {
            await openGraphFile(path);
          } else {
            addLog(null, "warning", `${basenameOf(path)} is neither an exclusion file nor a graph`);
          }
        } else if (!/\.[a-z0-9]{1,8}$/i.test(basenameOf(path))) {
          addNode("source.folder", at, { path });
          addLog(null, "info", `added pack folder ${path}`);
        } else {
          addLog(null, "warning", `${basenameOf(path)} cannot be added to the graph`);
        }
      }
    },
    [addLog, addNode, flow, openGraphFile],
  );

  const renameNode = useCallback(
    (oldId, requested) => {
      const base = cleanNodeName(requested);
      if (base === "" || base === oldId) {
        return;
      }
      const id = uniqueNodeId(base, new Set(nodes.map((node) => node.id).filter((existing) => existing !== oldId)));
      setNodes((list) => list.map((node) => (node.id === oldId ? { ...node, id } : node)));
      setEdges((list) =>
        list.map((edge) => {
          if (edge.source !== oldId && edge.target !== oldId) {
            return edge;
          }
          const source = edge.source === oldId ? id : edge.source;
          const target = edge.target === oldId ? id : edge.target;
          return { ...edge, source, target, id: `${source}.${edge.sourceHandle}->${target}.${edge.targetHandle}` };
        }),
      );
      setSelectedId((current) => (current === oldId ? id : current));
      setDirty(true);
      addLog(null, "info", `renamed ${oldId} to ${id}`);
    },
    [addLog, nodes, setEdges, setNodes],
  );

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedDefinition = selectedNode ? definitionMap.get(selectedNode.data.type) : null;
  const selectedGroupType = selectedDefinition?.group ? selectedDefinition.type : null;
  const canResetGroup = Boolean(selectedGroupType && groups[selectedGroupType] && baseMap.get(selectedGroupType)?.group && !scope.some((level) => level.type === selectedGroupType));
  const selectionCount = nodes.reduce((count, node) => count + (node.selected ? 1 : 0), 0);

  return (
    <DefinitionsContext.Provider value={definitionMap}>
      <GroupActionsContext.Provider value={groupActions}>
        <PathStatesContext.Provider value={pathStates}>
          <div className={[styles.app, logOpen ? styles.logOpen : "", booted ? "" : styles.booting].join(" ")}>
            <div
              ref={canvasRef}
              className={[styles.canvas, drag?.overCanvas ? styles.canvasTarget : "", cut.armed || cut.stroke ? styles.cutArmed : ""].join(" ")}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onPointerMove={(event) => {
                pointerRef.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerLeave={() => {
                pointerRef.current = null;
              }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                connectionLineComponent={ConnectionLine}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onSelectionChange={({ nodes: selected }) => setSelectedId(selected.length === 1 ? selected[0].id : null)}
                onNodeDoubleClick={(event, node) => enterGroup(node.id)}
                zoomOnDoubleClick={false}
                snapToGrid={cut.armed}
                snapGrid={[GRID, GRID]}
                selectionKeyCode="Shift"
                multiSelectionKeyCode="Shift"
                selectionMode={SelectionMode.Partial}
                deleteKeyCode={["Delete", "Backspace"]}
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                fitView
                fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
              >
                <Background variant={BackgroundVariant.Dots} gap={GRID} size={2.2} color="#3a3434" />
                <Controls showZoom={false} showFitView={false} showInteractive={false} position="bottom-left">
                  <ControlButton onClick={() => flow.zoomIn({ duration: 200 })} aria-label="Zoom in" {...tip("Zoom in", "right")}>
                    <Icon name="plus" size={12} />
                  </ControlButton>
                  <ControlButton onClick={() => flow.zoomOut({ duration: 200 })} aria-label="Zoom out" {...tip("Zoom out", "right")}>
                    <Icon name="minus" size={12} />
                  </ControlButton>
                  <ControlButton onClick={() => flow.fitView({ padding: FIT_PADDING, duration: 300, maxZoom: 1 })} aria-label="Fit view" {...tip("Fit everything in view", "right")}>
                    <Icon name="fit" size={12} />
                  </ControlButton>
                </Controls>
              </ReactFlow>
              <CutStroke stroke={cut.stroke} />
            </div>
            <Topbar
              fileName={filePath ? basenameOf(filePath) : null}
              trail={scope.map((level) => level.title)}
              onNavigate={exitTo}
              dirty={dirty}
              running={runStatus === "running"}
              scanning={scanning}
              onNew={handleNew}
              onOpen={handleOpen}
              onSave={handleSave}
              onCollect={handleCollect}
              collecting={collecting}
              onScan={handleScan}
              onRun={handleRun}
            onStop={() => window.strata.stopRun()}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={history.undo}
              onRedo={history.redo}
            />
            <Library definitions={definitions} pluginFolder={pluginFolder} onPickUp={pickUp} />
            <Inspector
              node={selectedNode}
              definition={selectedDefinition}
              pathStates={selectedNode ? pathStates.get(selectedNode.id) : null}
              onBrowsePath={(param, value) => browsePath(selectedNode.id, param, value)}
              onOpenGroup={selectedGroupType ? () => enterGroup(selectedNode.id) : null}
              onResetGroup={canResetGroup ? () => resetGroup(selectedGroupType) : null}
              groupEdited={Boolean(selectedGroupType && groups[selectedGroupType])}
            onToggleMute={() => toggleMute([selectedNode.id])}
              onParamsChange={(params) => {
                updateNodeData(selectedNode.id, { params });
                setDirty(true);
              }}
              onDelete={() => {
                flow.deleteElements({ nodes: [{ id: selectedNode.id }] });
                setSelectedId(null);
              }}
              onRename={(name) => renameNode(selectedNode.id, name)}
              selectionCount={selectionCount}
              onDeleteSelection={() => {
                flow.deleteElements({ nodes: nodes.filter((node) => node.selected).map((node) => ({ id: node.id })) });
                setSelectedId(null);
              }}
            />
            <LogPanel
              entries={logs}
              runStatus={runStatus}
              runTime={runTime}
              open={logOpen}
              onToggle={() => setLogOpen((value) => !value)}
              onClear={() => setLogs([])}
              onSelectNode={selectNode}
            />
            <DragGhost drag={drag} />
            <TooltipLayer />
          </div>
          {!splashGone && <Splash leaving={booted} status={bootStatus} onDone={() => setSplashGone(true)} />}
        </PathStatesContext.Provider>
      </GroupActionsContext.Provider>
    </DefinitionsContext.Provider>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Workbench />
    </ReactFlowProvider>
  );
}
