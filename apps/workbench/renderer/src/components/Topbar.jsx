import { tip } from "../lib/tooltip.js";
import { Icon } from "./Icon.jsx";
import { Logo } from "./Logo.jsx";
import { Squircle } from "./Squircle.jsx";
import styles from "./Topbar.module.css";

export function Topbar({ fileName, trail = [], onNavigate, dirty, running, scanning, canUndo, canRedo, onNew, onOpen, onSave, onCollect, collecting, onScan, onRun, onStop, onUndo, onRedo }) {
  return (
    <Squircle as="header" radius={28} shadow className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.brand}>
          <Logo size={24} className={styles.mark} />
          Strata
        </span>
        <span className={styles.trail}>
          <button className={styles.file} onClick={() => onNavigate?.(0)} disabled={trail.length === 0} {...tip(trail.length > 0 ? "Back to the graph" : null, "bottom")}>
            {fileName ?? "Untitled graph"}
            {dirty && <span className={styles.dirty} {...tip("Unsaved changes", "bottom")} />}
          </button>
          {trail.map((title, index) => (
            <span key={index} className={styles.crumb}>
              <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M4.5 3 7.5 6 4.5 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <button
                className={index === trail.length - 1 ? `${styles.file} ${styles.current}` : styles.file}
                onClick={() => onNavigate?.(index + 1)}
                disabled={index === trail.length - 1}
                {...tip(index === trail.length - 1 ? "Tab leaves the group" : null, "bottom")}
              >
                {title}
              </button>
            </span>
          ))}
        </span>
        <span className={styles.history}>
          <button className={styles.icon} onClick={onUndo} disabled={!canUndo} {...tip("Undo  Ctrl+Z", "bottom")} aria-label="Undo">
            <Icon name="undo" size={14} />
          </button>
          <button className={styles.icon} onClick={onRedo} disabled={!canRedo} {...tip("Redo  Ctrl+Shift+Z", "bottom")} aria-label="Redo">
            <Icon name="redo" size={14} />
          </button>
        </span>
      </div>
      <div className={styles.right}>
        <button className={styles.ghost} onClick={onNew}>
          <Icon name="new" size={13} />
          New
        </button>
        <button className={styles.ghost} onClick={onOpen}>
          <Icon name="open" size={13} />
          Open
        </button>
        <button className={styles.ghost} onClick={onSave}>
          <Icon name="save" size={13} />
          Save
        </button>
        <button className={styles.ghost} onClick={onCollect} disabled={collecting} {...tip("Copy files from elsewhere next to the graph, so the folder works on any computer", "bottom")}>
          <Icon name="files" size={13} />
          {collecting ? "Collecting" : "Collect"}
        </button>
        <span className={styles.divider} />
        <button className={styles.glass} onClick={onScan} disabled={scanning}>
          <Icon name="scan" size={13} />
          {scanning ? "Scanning" : "Scan Packs"}
        </button>
        <button className={running ? `${styles.primary} ${styles.stop}` : styles.primary} onClick={running ? onStop : onRun} {...tip(running ? "Stop the run" : null, "bottom")}>
          <Icon name={running ? "stop" : "play"} size={12} />
          {running ? "Stop" : "Run"}
        </button>
      </div>
    </Squircle>
  );
}
