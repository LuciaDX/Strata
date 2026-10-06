import styles from "./Splash.module.css";

const DOT_COLUMNS = 14;
const LAYERS = [
  { from: 0, to: DOT_COLUMNS, opacity: 1 },
  { from: 3, to: DOT_COLUMNS, opacity: 0.7 },
  { from: 0, to: 9, opacity: 0.42 },
];
const ROWS_PER_LAYER = 2;
const GRADIENT = [
  [255, 161, 171],
  [255, 82, 102],
  [240, 56, 75],
];

function gradientAt(amount) {
  const scaled = Math.min(1, Math.max(0, amount)) * (GRADIENT.length - 1);
  const index = Math.min(GRADIENT.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const [from, to] = [GRADIENT[index], GRADIENT[index + 1]];
  return `rgb(${from.map((channel, part) => Math.round(channel + (to[part] - channel) * local)).join(", ")})`;
}

function buildDots() {
  const dots = [];
  LAYERS.forEach((layer, index) => {
    for (let row = 0; row < ROWS_PER_LAYER; row++) {
      for (let column = layer.from; column < layer.to; column++) {
        dots.push({
          key: `${index}-${row}-${column}`,
          column,
          row: index * (ROWS_PER_LAYER + 1) + row,
          opacity: layer.opacity,
          color: index === 0 ? gradientAt((column + row * 2) / (DOT_COLUMNS + 1)) : "#ff5266",
          order: column + index * 3 + row,
        });
      }
    }
  });
  return dots;
}

const DOTS = buildDots();

export function Splash({ leaving, status, onDone }) {
  return (
    <div
      className={leaving ? `${styles.splash} ${styles.leaving}` : styles.splash}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) {
          onDone();
        }
      }}
    >
      <div className={styles.field} />
      <div className={styles.glow} />
      <div className={styles.center}>
        <div className={styles.mark} style={{ "--columns": DOT_COLUMNS }}>
          {DOTS.map((dot) => (
            <span
              key={dot.key}
              className={styles.dot}
              style={{ gridColumn: dot.column + 1, gridRow: dot.row + 1, "--order": dot.order, "--dot-opacity": dot.opacity, "--dot-color": dot.color }}
            />
          ))}
        </div>
        <div className={styles.wordRow}>
          <span className={styles.word}>Strata</span>
        </div>
        <p key={status} className={styles.status}>
          {status}
        </p>
      </div>
    </div>
  );
}
