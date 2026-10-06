import { useEffect, useState } from "react";
import { describeKey, generateKey } from "../lib/keys.js";
import { pathProblemText } from "../lib/graph.js";
import { Dropdown } from "./Dropdown.jsx";
import { Field } from "./Field.jsx";
import { Icon } from "./Icon.jsx";
import styles from "./Inspector.module.css";

function labelOf(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function ListField({ value, onChange }) {
  const [text, setText] = useState((value ?? []).join("\n"));

  useEffect(() => {
    setText((value ?? []).join("\n"));
  }, [value]);

  return (
    <Field multiline>
      <textarea
        className={styles.textarea}
        value={text}
        rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
        spellCheck={false}
        placeholder="One entry per line"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onChange(text.split("\n").map((line) => line.trim()).filter((line) => line !== ""))}
      />
    </Field>
  );
}

function NumberField({ spec, value, onChange }) {
  const step = spec.step ?? 1;
  const number = Number(value);
  const atMin = spec.min !== undefined && value !== "" && number <= spec.min;
  const atMax = spec.max !== undefined && value !== "" && number >= spec.max;

  function nudge(direction) {
    let next = (Number.isFinite(number) && value !== "" ? number : (spec.min ?? 0)) + direction * step;
    if (spec.min !== undefined) {
      next = Math.max(spec.min, next);
    }
    if (spec.max !== undefined) {
      next = Math.min(spec.max, next);
    }
    onChange(Number(next.toFixed(6)));
  }

  return (
    <Field>
      <input
        className={`${styles.input} ${styles.mono} ${styles.number}`}
        type="number"
        value={value ?? ""}
        min={spec.min}
        max={spec.max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      />
      <span className={styles.stepper}>
        <button type="button" className={styles.step} onClick={() => nudge(-1)} disabled={atMin} aria-label="Decrease">
          <Icon name="minus" size={10} />
        </button>
        <button type="button" className={styles.step} onClick={() => nudge(1)} disabled={atMax} aria-label="Increase">
          <Icon name="plus" size={10} />
        </button>
      </span>
    </Field>
  );
}

function filtersOf(spec) {
  const extensions = spec.extensions ?? ["json"];
  return [{ name: extensions.map((extension) => `.${extension}`).join(", "), extensions }, { name: "All files", extensions: ["*"] }];
}

async function browse(spec) {
  if (spec.type === "folder") {
    const properties = spec.mode === "save" ? ["openDirectory", "createDirectory", "promptToCreate"] : ["openDirectory"];
    const result = await window.strata.openDialog({ properties });
    return result.canceled ? null : result.filePaths[0];
  }
  if (spec.mode === "save") {
    const result = await window.strata.saveDialog({ filters: filtersOf(spec) });
    return result.canceled ? null : result.filePath;
  }
  const result = await window.strata.openDialog({ properties: ["openFile"], filters: filtersOf(spec) });
  return result.canceled ? null : result.filePaths[0];
}

export function ParamField({ name, spec, value, values, onChange, pathState, onBrowse }) {
  const missing = spec.required && (value === undefined || value === "" || value === null);

  let control;
  if (spec.type === "boolean") {
    control = (
      <button className={styles.switch} role="switch" aria-checked={Boolean(value)} onClick={() => onChange(!value)}>
        <span className={value ? `${styles.track} ${styles.trackOn}` : styles.track}>
          <span className={styles.nub} />
        </span>
        <span className={styles.switchLabel}>{value ? "On" : "Off"}</span>
      </button>
    );
  } else if (spec.type === "number") {
    control = <NumberField spec={spec} value={value} onChange={onChange} />;
  } else if (spec.type === "key") {
    const mode = values?.mode ?? "text";
    const state = describeKey(mode, value);
    control = (
      <>
        <div className={styles.pathRow}>
          <Field>
            <input
              className={`${styles.input} ${styles.mono}`}
              value={value ?? ""}
              spellCheck={false}
              placeholder={mode === "symbols" ? "64 hex characters" : "Type a key"}
              onChange={(event) => onChange(event.target.value)}
            />
          </Field>
          <button className={styles.browse} onClick={() => onChange(generateKey(mode))}>
            Generate
          </button>
        </div>
        <span className={state.valid ? styles.hint : styles.hintError}>{state.text}</span>
      </>
    );
  } else if (spec.type === "list") {
    control = <ListField value={value} onChange={onChange} />;
  } else if (spec.type === "choice") {
    control = <Dropdown value={value} options={spec.options ?? []} onChange={onChange} />;
  } else if (spec.type === "file" || spec.type === "folder") {
    control = (
      <div className={styles.pathRow}>
        <Field className={pathState ? styles.pathProblem : ""}>
          <input
            className={`${styles.input} ${styles.mono}`}
            value={value ?? ""}
            spellCheck={false}
            placeholder={spec.type === "folder" ? "Choose a folder" : "Choose a file"}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
        <button
          className={styles.browse}
          onClick={async () => {
            const picked = await browse(spec);
            if (picked) {
              (onBrowse ?? onChange)(picked);
            }
          }}
        >
          Browse
        </button>
      </div>
    );
  } else {
    control = (
      <Field>
        <input
          className={styles.input}
          value={value ?? ""}
          spellCheck={false}
          type={/key|secret|password/i.test(name) ? "password" : "text"}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  }

  return (
    <div className={spec.when ? `${styles.field} ${styles.nested}` : styles.field}>
      <span className={styles.fieldLabel}>
        {spec.label ?? labelOf(name)}
        {spec.required && <span className={missing ? styles.requiredMissing : styles.required}>required</span>}
      </span>
      {control}
      {pathState && <span className={styles.hintError}>{pathProblemText(pathState)}. Browse to choose it again</span>}
      {spec.description && <span className={styles.hint}>{spec.description}</span>}
    </div>
  );
}
