import { useEffect, useRef, useState } from "react";

const CUT_TARGETS = ".react-flow__pane, .react-flow__edge";
const CUT_CLASS = "strata-cut";

function orientation(p, q, r) {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function isCutKey(event) {
  return event.ctrlKey || event.metaKey;
}

function startsCut(event) {
  return isCutKey(event) && event.button === 0 && Boolean(event.target.closest?.(CUT_TARGETS)) && !event.target.closest(".react-flow__node");
}

function sampleEdges(canvas, origin) {
  const edges = [];
  for (const element of canvas.querySelectorAll(".react-flow__edge")) {
    const path = element.querySelector(".react-flow__edge-path");
    const matrix = path?.getScreenCTM();
    if (!matrix) {
      continue;
    }
    const length = path.getTotalLength();
    const steps = Math.max(12, Math.ceil(length / 8));
    const points = [];
    for (let index = 0; index <= steps; index++) {
      const point = path.getPointAtLength((length * index) / steps).matrixTransform(matrix);
      points.push({ x: point.x - origin.left, y: point.y - origin.top });
    }
    edges.push({ id: element.dataset.id, element, points });
  }
  return edges;
}

export function useCutTool(canvasRef, onCut) {
  const [armed, setArmed] = useState(false);
  const [stroke, setStroke] = useState(null);
  const onCutRef = useRef(onCut);
  onCutRef.current = onCut;

  useEffect(() => {
    function onKey(event) {
      setArmed(isCutKey(event));
    }

    function onBlur() {
      setArmed(false);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    function block(event) {
      if (startsCut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onDown(event) {
      if (!startsCut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const origin = canvas.getBoundingClientRect();
      const edges = sampleEdges(canvas, origin);
      const start = { x: event.clientX - origin.left, y: event.clientY - origin.top };
      let hits = new Set();
      setStroke({ start, end: start, count: 0 });

      function onMove(moveEvent) {
        const end = { x: moveEvent.clientX - origin.left, y: moveEvent.clientY - origin.top };
        const next = new Set();
        for (const edge of edges) {
          for (let index = 1; index < edge.points.length; index++) {
            if (segmentsCross(start, end, edge.points[index - 1], edge.points[index])) {
              next.add(edge.id);
              break;
            }
          }
          edge.element.classList.toggle(CUT_CLASS, next.has(edge.id));
        }
        hits = next;
        setStroke({ start, end, count: hits.size });
      }

      function finish(cancelled) {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("keydown", onEscape, true);
        for (const edge of edges) {
          edge.element.classList.remove(CUT_CLASS);
        }
        setStroke(null);
        if (!cancelled && hits.size > 0) {
          onCutRef.current([...hits]);
        }
      }

      function onUp() {
        finish(false);
      }

      function onEscape(keyEvent) {
        if (keyEvent.key === "Escape") {
          finish(true);
        }
      }

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("keydown", onEscape, true);
    }

    canvas.addEventListener("pointerdown", onDown, true);
    canvas.addEventListener("mousedown", block, true);
    canvas.addEventListener("click", block, true);
    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      canvas.removeEventListener("mousedown", block, true);
      canvas.removeEventListener("click", block, true);
    };
  }, [canvasRef]);

  return { armed, stroke };
}
