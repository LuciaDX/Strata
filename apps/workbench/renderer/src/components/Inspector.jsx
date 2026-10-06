import { iconOf, portColor } from "../lib/graph.js";
import { Icon } from "./Icon.jsx";
import { NodeName } from "./NodeName.jsx";
import { ParamField } from "./ParamField.jsx";
import { Squircle } from "./Squircle.jsx";
import { tip } from "../lib/tooltip.js";
import styles from "./Inspector.module.css";

function Ports({ title, ports }) {
  const entries = Object.entries(ports ?? {}).filter(([, port]) => port.type !== "exec");
  if (entries.length === 0) {
    return null;
  }
  return (
    <Squircle radius={22} className={styles.section}>
      <p className={styles.sectionLabel}>{title}</p>
      {entries.map(([name, port]) => (
        <div key={name} className={styles.port}>
          <span className={styles.portDot} style={{ background: portColor(port.type), color: portColor(port.type) }} />
          <span>{name}</span>
          <span className={styles.portType}>
            {port.type}
            {port.multiple ? ", many" : ""}
            {port.optional ? ", optional" : ""}
          </span>
        </div>
      ))}
    </Squircle>
  );
}

export function Inspector({ node, definition, pathStates, onBrowsePath, onParamsChange, onDelete, onRename, selectionCount, onDeleteSelection, onOpenGroup, onResetGroup, groupEdited, onToggleMute }) {
  if (!node && selectionCount > 1) {
    return (
      <Squircle as="aside" radius={30} shadow className={styles.inspector}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <span />
            <span />
            <span />
          </span>
          <p className={styles.emptyTitle}>{selectionCount} nodes selected</p>
          <p className={styles.emptyText}>Drag any of them to move the group. Shift-click a node to add or remove it.</p>
          <button className={styles.deleteMany} onClick={onDeleteSelection}>
            Delete {selectionCount} nodes
          </button>
        </div>
      </Squircle>
    );
  }

  if (!node) {
    return (
      <Squircle as="aside" radius={30} shadow className={styles.inspector}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <span />
            <span />
            <span />
          </span>
          <p className={styles.emptyTitle}>Nothing selected</p>
          <p className={styles.emptyText}>Select a node to edit its settings, or hold Shift and drag to select several. Drag nodes in from the library, or drop an exclusion file or pack folder onto the canvas.</p>
        </div>
      </Squircle>
    );
  }

  const params = definition?.params ?? {};

  return (
    <Squircle as="aside" radius={30} shadow className={styles.inspector}>
      <div key={node.id} className={styles.body}>
        <div className={styles.head}>
          <span className={styles.headIcon}>
            <Icon name={iconOf(definition)} size={16} />
          </span>
          <div className={styles.headTitles}>
            <p className={styles.title}>{definition?.title ?? node.data.type}</p>
            <p className={styles.id}>
              <NodeName value={node.id} onRename={onRename} />
            </p>
          </div>
          {!definition?.start && !definition?.end && (
            <div className={styles.headActions}>
              <button
                className={node.data.muted ? `${styles.mute} ${styles.muteOn}` : styles.mute}
                onClick={onToggleMute}
                aria-label={node.data.muted ? "Unmute" : "Mute"}
                {...tip(node.data.muted ? "Unmute (M)" : "Mute: pass its inputs straight through (M)", "bottom")}
              >
                <Icon name="mute" size={13} />
              </button>
              <button className={styles.delete} onClick={onDelete} aria-label="Delete" {...tip("Delete node (Del)", "bottom")}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          )}
        </div>
        {definition?.description && <p className={styles.description}>{definition.description}</p>}
        {!definition && <p className={styles.warning}>No node of type "{node.data.type}" is installed.</p>}
        {onOpenGroup && (
          <Squircle radius={22} className={styles.section}>
            <p className={styles.sectionLabel}>Group</p>
            <p className={styles.groupText}>
              {groupEdited ? "This graph keeps its own edited copy of the group." : "Uses the plugin version. Editing it gives this graph its own copy."}
            </p>
            <div className={styles.groupActions}>
              <button className={styles.browse} onClick={onOpenGroup}>
                <Icon name="layers" size={13} />
                Open group
              </button>
              {onResetGroup && (
                <button className={styles.reset} onClick={onResetGroup} {...tip("Drop this graph's edits and use the plugin version", "bottom")}>
                  Reset to plugin
                </button>
              )}
            </div>
          </Squircle>
        )}
        {Object.keys(params).length > 0 && (
          <Squircle radius={22} className={styles.section}>
            <p className={styles.sectionLabel}>Settings</p>
            {Object.entries(params).filter(([, spec]) => !spec.when || node.data.params[spec.when]).map(([name, spec]) => (
              <ParamField
                key={name}
                name={name}
                spec={spec}
                value={node.data.params[name]}
                values={node.data.params}
                pathState={pathStates?.[name]}
                onBrowse={spec.type === "file" || spec.type === "folder" ? (value) => onBrowsePath(name, value) : undefined}
                onChange={(value) => onParamsChange({ ...node.data.params, [name]: value })}
              />
            ))}
          </Squircle>
        )}
        <Ports title="Inputs" ports={definition?.inputs} />
        <Ports title="Outputs" ports={definition?.outputs} />
        {definition?.source && <p className={styles.source}>Plugin: {definition.source}</p>}
      </div>
    </Squircle>
  );
}
