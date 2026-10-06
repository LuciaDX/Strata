import { useEffect, useId, useRef, useState } from "react";
import { BaseEdge, getBezierPath, Position } from "@xyflow/react";
import { portColor, useDefinitions } from "../lib/graph.js";

const SOCKET_RADIUS = 6.5;
const SNAP_TIME = 45;

function socketCenter(x, position) {
  if (position === Position.Right) {
    return x - SOCKET_RADIUS;
  }
  if (position === Position.Left) {
    return x + SOCKET_RADIUS;
  }
  return x;
}

function curve(fromX, fromY, fromPosition, toX, toY, toPosition) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  return path;
}

export function StrataEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, interactionWidth }) {
  const path = curve(socketCenter(sourceX, sourcePosition), sourceY, sourcePosition, socketCenter(targetX, targetPosition), targetY, targetPosition);
  return <BaseEdge id={id} path={path} style={style} interactionWidth={interactionWidth} />;
}

function portSpec(definitions, node, handle) {
  const definition = definitions.get(node?.data?.type);
  const ports = handle?.type === "source" ? definition?.outputs : definition?.inputs;
  return ports?.[handle?.id] ?? null;
}

function useEasedEnd(x, y, snapped) {
  const shown = useRef({ x, y });
  const snap = useRef(null);
  const lastSnapped = useRef(snapped);
  const [, setFrame] = useState(0);

  if (lastSnapped.current !== snapped) {
    lastSnapped.current = snapped;
    snap.current = { time: performance.now(), from: shown.current };
  }

  let point = { x, y };
  if (snap.current) {
    const progress = 1 - Math.exp(-(performance.now() - snap.current.time) / SNAP_TIME);
    if (progress > 0.995) {
      snap.current = null;
    } else {
      const from = snap.current.from;
      point = { x: from.x + (x - from.x) * progress, y: from.y + (y - from.y) * progress };
    }
  }
  shown.current = point;
  const animating = snap.current !== null;

  useEffect(() => {
    if (!animating) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => setFrame((value) => value + 1));
    return () => cancelAnimationFrame(frame);
  });

  return point;
}

function SocketHole({ x, y, multiple }) {
  const size = SOCKET_RADIUS * 2;
  return <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={multiple ? 4 : SOCKET_RADIUS} fill="#000000" />;
}

export function ConnectionLine({ fromNode, fromHandle, fromX, fromY, fromPosition, toNode, toHandle, toX, toY, toPosition, connectionStatus }) {
  const definitions = useDefinitions();
  const mask = `socket${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const fromSpec = portSpec(definitions, fromNode, fromHandle);
  const toSpec = toHandle ? portSpec(definitions, toNode, toHandle) : null;
  const invalid = connectionStatus === "invalid";
  const color = invalid ? "var(--error-fg)" : portColor(fromSpec?.type ?? "any");
  const end = useEasedEnd(toX, toY, Boolean(toHandle));
  const path = curve(fromX, fromY, fromPosition, end.x, end.y, toPosition);
  const left = Math.min(fromX, end.x, toX) - 200;
  const top = Math.min(fromY, end.y, toY) - 200;
  const width = Math.abs(fromX - end.x) + Math.abs(fromX - toX) + 400;
  const height = Math.abs(fromY - end.y) + Math.abs(fromY - toY) + 400;

  return (
    <g>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x={left} y={top} width={width} height={height}>
          <rect x={left} y={top} width={width} height={height} fill="#ffffff" />
          <SocketHole x={fromX} y={fromY} multiple={fromSpec?.multiple} />
          {toHandle && <SocketHole x={toX} y={toY} multiple={toSpec?.multiple} />}
        </mask>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeDasharray={toHandle ? undefined : "6 5"} opacity={invalid ? 0.7 : 1} mask={`url(#${mask})`} />
    </g>
  );
}
