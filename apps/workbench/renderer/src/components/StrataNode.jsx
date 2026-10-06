import { memo, useEffect } from "react";
import { Handle, Position, useNodeConnections, useUpdateNodeInternals } from "@xyflow/react";
import { dataPorts, execPorts, growIndex, iconOf, portColor, useDefinitions, useGroupActions, usePathStates } from "../lib/graph.js";
import { Icon } from "./Icon.jsx";
import { Squircle } from "./Squircle.jsx";
import { tip } from "../lib/tooltip.js";
import styles from "./StrataNode.module.css";

const STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  warning: "Warning",
  skipped: "Skipped",
  muted: "Muted",
  unfound: "Not found",
};

function statusTip(status, problems) {
  if (status === "muted") {
    return "Passes its inputs straight through. M unmutes";
  }
  if (status === "unfound") {
    const foreign = Object.values(problems).includes("foreign");
    return foreign ? "Uses a path from another computer. Select it to choose the file again" : "A file or folder it uses was not found. Select it to choose it again";
  }
  return null;
}

function execLabel(name) {
  return name.replace(/^then(\d+)$/, "Then $1");
}

function ExecHandle({ name, side, className }) {
  const connections = useNodeConnections({ handleType: side === "input" ? "target" : "source", handleId: name });
  return (
    <Handle
      type={side === "input" ? "target" : "source"}
      position={side === "input" ? Position.Left : Position.Right}
      id={name}
      className={[styles.exec, connections.length > 0 ? styles.execLinked : "", className].join(" ")}
    >
      <svg className={styles.execShape} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2.5 2.5h5.2l4.3 4.5-4.3 4.5H2.5z" />
      </svg>
    </Handle>
  );
}

function PortRow({ name, port, side }) {
  const color = portColor(port.type);
  return (
    <div className={side === "input" ? styles.inputRow : styles.outputRow}>
      <Handle
        type={side === "input" ? "target" : "source"}
        position={side === "input" ? Position.Left : Position.Right}
        id={name}
        className={port.multiple ? styles.handleMultiple : styles.handle}
        style={{ "--port-color": color }}
      />
      <span className={styles.portName}>{name}</span>
      <span className={styles.portType} style={{ color }}>
        {port.multiple ? `${port.type}[]` : port.type}
      </span>
    </div>
  );
}

function ExecRow({ name }) {
  return (
    <div className={styles.outputRow}>
      <ExecHandle name={name} side="output" className={styles.execRow} />
      <span className={styles.portName}>{execLabel(name)}</span>
    </div>
  );
}

export const StrataNode = memo(function StrataNode({ id, data, selected }) {
  const definitions = useDefinitions();
  const groupActions = useGroupActions();
  const definition = definitions.get(data.type);
  const problems = usePathStates().get(id);
  const status = data.muted ? "muted" : problems && (data.status ?? "idle") === "idle" ? "unfound" : (data.status ?? "idle");
  const classes = [styles.node, styles[status], selected ? styles.selected : "", definition ? "" : styles.missing].join(" ");
  const sources = useNodeConnections({ handleType: "source" });
  const updateNodeInternals = useUpdateNodeInternals();
  const grown = definition?.growOutputs ? Math.max(0, ...sources.map((connection) => growIndex(definition, connection.sourceHandle) ?? 0)) + 1 : 0;
  const execIn = execPorts(definition?.inputs)[0];
  const execOuts = definition?.growOutputs
    ? Array.from({ length: grown }, (_, index) => [`${definition.growOutputs}${index + 1}`])
    : execPorts(definition?.outputs);
  const headerOut = execOuts.length === 1 && !definition?.growOutputs ? execOuts[0] : null;
  const rowOuts = headerOut ? [] : execOuts;
  const inputs = dataPorts(definition?.inputs);
  const outputs = dataPorts(definition?.outputs);
  const hasRows = inputs.length + outputs.length + rowOuts.length > 0;

  useEffect(() => {
    updateNodeInternals(id);
  }, [grown, id, updateNodeInternals]);

  return (
    <Squircle radius={24} shadow className={classes}>
      <div className={styles.header}>
        {execIn && <ExecHandle name={execIn[0]} side="input" className={styles.execHeader} />}
        <span className={styles.nodeIcon}>
          <Icon name={iconOf(definition)} size={13} />
        </span>
        <div className={styles.titles}>
          <span className={styles.title}>{definition?.title ?? data.type}</span>
          <span className={styles.category}>{id}</span>
        </div>
        {STATUS_LABELS[status] && (
          <span className={`${styles.status} ${styles[`status_${status}`]}`} {...tip(statusTip(status, problems), "bottom")}>
            {STATUS_LABELS[status]}
          </span>
        )}
        {headerOut && <ExecHandle name={headerOut[0]} side="output" className={styles.execHeader} />}
      </div>
      {hasRows && (
        <div className={styles.ports}>
          {rowOuts.map(([name]) => (
            <ExecRow key={`exec-${name}`} name={name} />
          ))}
          {inputs.map(([name, port]) => (
            <PortRow key={`in-${name}`} name={name} port={port} side="input" />
          ))}
          {outputs.map(([name, port]) => (
            <PortRow key={`out-${name}`} name={name} port={port} side="output" />
          ))}
        </div>
      )}
      {data.summary && <div className={styles.summary} {...tip(data.summary, "bottom")}>{data.summary}</div>}
      {definition?.group && (
        <button className={`${styles.openGroup} nodrag`} onClick={() => groupActions.open(id)} {...tip("Double-click the node or press Tab", "bottom")}>
          <Icon name="layers" size={13} />
          Open group
        </button>
      )}
    </Squircle>
  );
});
