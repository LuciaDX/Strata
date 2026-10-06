import { useMemo, useState } from "react";
import { dataPorts, iconOf, portColor } from "../lib/graph.js";
import { Icon } from "./Icon.jsx";
import { tip } from "../lib/tooltip.js";
import { Field } from "./Field.jsx";
import { Squircle } from "./Squircle.jsx";
import styles from "./Library.module.css";

const CATEGORY_ORDER = ["Flow", "Input", "Pack", "Exclusions", "Processing", "Obfuscation", "Encryption", "Archiving", "Output", "Groups", "Examples", "Other"];

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function PortList({ label, ports }) {
  if (ports.length === 0) {
    return null;
  }
  return (
    <div className={styles.tipPorts}>
      <span className={styles.tipLabel}>{label}</span>
      {ports.map(([name, port]) => (
        <span key={name} className={styles.tipPort}>
          <span className={styles.dot} style={{ background: portColor(port.type), color: portColor(port.type) }} />
          {name}
        </span>
      ))}
    </div>
  );
}

function NodeTip({ definition }) {
  return (
    <div className={styles.tipBody}>
      <span className={styles.tipTitle}>
        <Icon name={iconOf(definition)} size={13} />
        {definition.title}
      </span>
      {definition.description && <span className={styles.tipText}>{definition.description}</span>}
      <PortList label="In" ports={dataPorts(definition.inputs)} />
      <PortList label="Out" ports={dataPorts(definition.outputs)} />
      <span className={styles.tipHint}>{definition.group ? "Drag onto the canvas, then double-click it to open the group" : "Drag onto the canvas to add"}</span>
    </div>
  );
}

export function Library({ definitions, pluginFolder, onPickUp }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map();
    for (const definition of definitions) {
      if (definition.start) {
        continue;
      }
      const haystack = `${definition.title} ${definition.type} ${definition.description}`.toLowerCase();
      if (needle && !haystack.includes(needle)) {
        continue;
      }
      const list = map.get(definition.category) ?? [];
      list.push(definition);
      map.set(definition.category, list);
    }
    return [...map.entries()].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]) || a[0].localeCompare(b[0]));
  }, [definitions, query]);

  return (
    <Squircle as="aside" radius={30} shadow className={styles.library}>
      <div className={styles.head}>
        <p className={styles.heading}>Nodes</p>
        <Field className={styles.searchField}>
          <Icon name="search" size={13} className={styles.searchIcon} />
          <input
            className={styles.search}
            placeholder="Search nodes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
          />
        </Field>
      </div>
      <div className={styles.groups}>
        {groups.map(([category, list]) => (
          <section key={category} className={styles.group}>
            <p className={styles.label}>{category}</p>
            {list.map((definition) => (
              <div
                key={definition.type}
                className={styles.item}
                onPointerDown={(event) => onPickUp(definition, event)}
                {...tip(<NodeTip definition={definition} />, "right")}
              >
                <span className={styles.itemMain}>
                  <span className={styles.itemIcon}>
                    <Icon name={iconOf(definition)} size={13} />
                  </span>
                  <span className={styles.itemTitle}>{definition.title}</span>
                  {definition.group && <span className={styles.groupTag}>Group</span>}
                </span>
                <span className={styles.itemPorts}>
                  {Object.values(definition.outputs).filter((port) => port.type !== "exec").map((port, index) => (
                    <span key={index} className={styles.dot} style={{ background: portColor(port.type), color: portColor(port.type) }} />
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className={styles.empty}>No nodes match "{query}"</p>}
      </div>
      {pluginFolder && (
        <Squircle as="button" radius={18} className={styles.footer} onClick={() => window.strata.openPluginFolder()} {...tip(pluginFolder)}>
          <Icon name="puzzle" size={13} />
          <span>
            <b>Open plugins folder</b>
            Your nodes and groups, loaded after the built-in ones
          </span>
        </Squircle>
      )}
    </Squircle>
  );
}
