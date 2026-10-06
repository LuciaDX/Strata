import { useEffect, useRef } from "react";
import { Icon } from "./Icon.jsx";
import { Squircle } from "./Squircle.jsx";
import styles from "./LogPanel.module.css";

const LEVEL_ICONS = {
  info: "info",
  success: "check",
  warning: "warning",
  error: "close",
};

const RUN_LABELS = {
  idle: "Ready",
  running: "Running",
  done: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

export function LogPanel({ entries, runStatus, runTime, open, onToggle, onClear, onSelectNode }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, open]);

  const warnings = entries.filter((entry) => entry.level === "warning").length;
  const errors = entries.filter((entry) => entry.level === "error").length;

  return (
    <Squircle as="section" radius={open ? 30 : 23} shadow className={open ? `${styles.panel} ${styles.open}` : styles.panel}>
      <div className={styles.clip}>
        <div className={styles.head} onClick={onToggle}>
          <span className={`${styles.run} ${styles[`run_${runStatus}`]}`}>{RUN_LABELS[runStatus]}</span>
          {runTime !== null && <span className={styles.meta}>{(runTime / 1000).toFixed(2)} s</span>}
          {warnings > 0 && <span className={styles.countWarning}>{warnings} warnings</span>}
          {errors > 0 && <span className={styles.countError}>{errors} errors</span>}
          <span className={styles.spacer} />
          <button
            className={styles.clear}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            <Icon name="trash" size={12} />
            Clear
          </button>
          <button className={styles.toggle}>
            <Icon name="chevron-down" size={12} className={open ? styles.chevronOpen : styles.chevron} />
            {open ? "Hide log" : "Show log"}
          </button>
        </div>
        {open && (
          <div className={styles.list} ref={listRef}>
            {entries.length === 0 && <p className={styles.empty}>Run the graph to see what each node does.</p>}
            {entries.map((entry) => (
              <div key={entry.key} className={`${styles.entry} ${styles[entry.level]}`}>
                <Icon name={LEVEL_ICONS[entry.level] ?? "info"} size={11} className={styles.levelIcon} />
                <span className={styles.time}>{entry.time}</span>
                {entry.id ? (
                  <button className={styles.node} onClick={() => onSelectNode(entry.id)}>
                    {entry.id}
                  </button>
                ) : (
                  <span className={styles.nodeless}>strata</span>
                )}
                <span className={styles.message}>{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Squircle>
  );
}
