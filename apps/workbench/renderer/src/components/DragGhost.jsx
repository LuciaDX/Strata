import { portColor } from "../lib/graph.js";
import { Squircle } from "./Squircle.jsx";
import styles from "./DragGhost.module.css";

export const GHOST_ANCHOR = { x: 28, y: 22 };

export function DragGhost({ drag }) {
  if (!drag) {
    return null;
  }
  const { definition, x, y, scale, overCanvas } = drag;
  const ports = [
    ...Object.entries(definition.inputs).filter(([, port]) => port.type !== "exec").map(([name, port]) => ({ name, port, side: "input" })),
    ...Object.entries(definition.outputs).filter(([, port]) => port.type !== "exec").map(([name, port]) => ({ name, port, side: "output" })),
  ];

  return (
    <div
      className={styles.layer}
      style={{ transform: `translate(${x - GHOST_ANCHOR.x * scale}px, ${y - GHOST_ANCHOR.y * scale}px) scale(${scale})` }}
    >
      <Squircle radius={24} shadow className={overCanvas ? `${styles.ghost} ${styles.active}` : styles.ghost}>
        <div className={styles.header}>
          <span className={styles.title}>{definition.title}</span>
          <span className={styles.category}>{definition.type.split(".").pop()}</span>
        </div>
        <div className={styles.ports}>
          {ports.map(({ name, port, side }) => (
            <div key={`${side}-${name}`} className={side === "input" ? styles.inputRow : styles.outputRow}>
              <span className={styles.dot} style={{ "--port-color": portColor(port.type) }} />
              <span className={styles.portName}>{name}</span>
            </div>
          ))}
        </div>
      </Squircle>
    </div>
  );
}
