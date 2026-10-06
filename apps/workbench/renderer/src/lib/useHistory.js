import { useCallback, useEffect, useRef, useState } from "react";

const LIMIT = 200;
const SETTLE = 350;

function snapshotOf(nodes, edges) {
  return structuredClone({
    nodes: nodes.map((node) => ({
      id: node.id,
      position: node.position,
      deletable: node.deletable,
      data: { type: node.data.type, params: node.data.params, muted: Boolean(node.data.muted) },
    })),
    edges: edges.map(({ selected, ...edge }) => edge),
  });
}

export function useHistory(nodes, edges, setNodes, setEdges, onRestore) {
  const state = useRef({ past: [], future: [], current: null, key: null, pending: null, timer: null });
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });

  const sync = useCallback(() => {
    setCounts({ undo: state.current.past.length, redo: state.current.future.length });
  }, []);

  const flush = useCallback(() => {
    const history = state.current;
    clearTimeout(history.timer);
    if (!history.pending) {
      return;
    }
    history.past.push(history.current);
    if (history.past.length > LIMIT) {
      history.past.shift();
    }
    history.current = history.pending.snapshot;
    history.key = history.pending.key;
    history.pending = null;
    history.future = [];
    sync();
  }, [sync]);

  useEffect(() => {
    if (nodes.some((node) => node.dragging)) {
      return;
    }
    const history = state.current;
    const snapshot = snapshotOf(nodes, edges);
    const key = JSON.stringify(snapshot);
    if (history.current === null) {
      history.current = snapshot;
      history.key = key;
      return;
    }
    clearTimeout(history.timer);
    if (key === history.key) {
      history.pending = null;
      return;
    }
    history.pending = { snapshot, key };
    history.timer = setTimeout(flush, SETTLE);
  }, [edges, flush, nodes]);

  useEffect(() => () => clearTimeout(state.current.timer), []);

  const apply = useCallback(
    (snapshot) => {
      const history = state.current;
      history.current = snapshot;
      history.key = JSON.stringify(snapshot);
      setNodes(
        structuredClone(snapshot.nodes).map((node) => ({
          ...node,
          type: "strata",
          selected: false,
          data: { ...node.data, status: "idle", summary: "" },
        })),
      );
      setEdges(structuredClone(snapshot.edges));
      sync();
      onRestore?.();
    },
    [onRestore, setEdges, setNodes, sync],
  );

  const undo = useCallback(() => {
    flush();
    const history = state.current;
    if (history.past.length === 0) {
      return;
    }
    history.future.push(history.current);
    apply(history.past.pop());
  }, [apply, flush]);

  const redo = useCallback(() => {
    flush();
    const history = state.current;
    if (history.future.length === 0) {
      return;
    }
    history.past.push(history.current);
    apply(history.future.pop());
  }, [apply, flush]);

  const reset = useCallback(() => {
    const history = state.current;
    clearTimeout(history.timer);
    state.current = { past: [], future: [], current: null, key: null, pending: null, timer: null };
    sync();
  }, [sync]);

  return { undo, redo, reset, canUndo: counts.undo > 0, canRedo: counts.redo > 0 };
}
