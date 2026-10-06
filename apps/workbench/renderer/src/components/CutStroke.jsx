import styles from "./CutStroke.module.css";

export function CutStroke({ stroke }) {
  if (!stroke) {
    return null;
  }
  const { start, end } = stroke;

  return (
    <div className={styles.layer}>
      <svg className={styles.svg}>
        <line className={styles.glow} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
        <line className={styles.line} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
        <circle className={styles.anchor} cx={start.x} cy={start.y} r={4} />
        <circle className={styles.tip} cx={end.x} cy={end.y} r={4} />
      </svg>
      {stroke.count > 0 && (
        <span key={stroke.count} className={styles.badge} style={{ left: end.x, top: end.y }}>
          Cut {stroke.count}
        </span>
      )}
    </div>
  );
}
