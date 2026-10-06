import { useEffect, useRef, useState } from "react";
import { tip } from "../lib/tooltip.js";
import styles from "./NodeName.module.css";

export function NodeName({ value, onRename, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function start(event) {
    event.stopPropagation();
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const name = draft.trim();
    if (name !== "" && name !== value) {
      onRename(name);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`${styles.input} ${className}`}
        value={draft}
        size={Math.max(4, draft.length + 1)}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            commit();
          } else if (event.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span className={`${styles.name} ${className}`} {...tip("Click to rename", "bottom")} onClick={start}>
      {value}
    </span>
  );
}
