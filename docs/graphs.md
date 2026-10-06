# Graphs

A graph is nodes plus links, saved as `{ "nodes": [...], "links": [{ "from": "node.port", "to": "node.port" }] }`.

## Steps and values

Nodes come in two kinds.

- **Steps** do work in order: Obfuscate, Obfuscator, Encrypt, BrArchive and every Write node. They have a white input (`exec`) and a white output (`then`) in their title row.
- **Values** have no white pins: Folder, Key, Exclusion File, Keep Names, Scan Packs and the obfuscation rules. A value is computed when a step first needs it, and only once per run.

A plugin node is a step unless its definition sets `pure: true`.

## The white chain

Every graph has one Start node, which cannot be deleted. A run follows the white wires from Start, running each step it reaches. When a step runs, it pulls its data inputs: values are computed on demand, and outputs of steps that already ran are reused.

- A white output connects to one step. To branch, use a **Sequence** node. It starts with one output, Then 1; connecting the last free output adds the next one, without limit. It runs its outputs in number order and finishes each branch before starting the next. Disconnecting one closes the gap, keeping the order of the rest.
- A plugin node can grow outputs the same way by setting `growOutputs` to a prefix (Sequence uses `"then"`); its outputs are then `then1`, `then2` and so on.
- A step that is not on the chain does not run and is shown as Skipped. Unplugging the white wire is how to switch a step off.
- A step that needs the output of a step later in the chain stops the run with an error naming both.
- A white input can be reached from several places; a step still runs at most once per run.

## Muting

A muted node (M, or Mute in the inspector) does not run. Each of its outputs gets the input of the same name, or else the first input of the same type, so a muted Encrypt or BrArchive hands the pack on unchanged and the white chain carries on. An output with nothing to pass on is empty: a node that needs it stops the run with an error naming the muted node, and an optional input simply gets nothing. A muted node does not need its own inputs connected. Graphs save it as `"muted": true` on the node.

## Editing

- Ctrl+C copies the selected nodes and the wires between them, as JSON on the system clipboard, so they can be pasted into another graph or shared as text. Edited group copies the nodes use come along.
- Ctrl+V pastes at the mouse, with new ids where names are taken. Start and the Group Input and Output nodes are never copied.
- Ctrl+D duplicates the selection next to itself.
- Holding Ctrl while dragging a node snaps it to the dot grid.

## Files and folders

Saving stores paths relative to the graph file, with forward slashes, when they are inside its folder or up to two folders above it, so a folder holding the graph, the pack and the exclusion file works on any computer and any system. Paths further away, or on another drive, are saved in full. Relative paths are resolved from the graph's folder when it runs, in the workbench and the CLI.

When a graph opens, every file and folder it reads is checked. A node with a path that does not exist, or one written on another system such as `C:\...` opened on a Mac, shows Not found and is listed in the log; the check runs again whenever the window gets focus. Browse to the right place and any other missing paths that moved the same way, such as everything that was under `C:\Users\you\Packs` and is now under `/Users/you/Packs`, are offered to be relinked with it.

Collect copies the packs and files the graph reads from elsewhere into the graph's folder and points the graph at the copies. Outputs are not copied, only pointed into the folder. A name that is already taken gets a number, as in `pack-2`.

## Groups

A group is a node with a graph inside. Double-click it, press Tab with it selected, or use Open group in the inspector to go inside; Tab or the breadcrumb in the top bar goes back out. Inside, Group Input hands out the values connected to the group and starts the group's white chain, and Group Output collects what the group passes on. Neither can be deleted.

Groups come from plugins as `*.group.json` files. Placing one uses the plugin version until its inside is edited; from then on the graph keeps its own copy under `"groups"`, keyed by the node type, and every node of that type in the graph uses it, like a node group in Blender. Reset to plugin in the inspector drops the copy. A copy that ends up identical to the plugin version is dropped automatically, and copies no node uses are left out when saving.

```json
{
  "nodes": [{ "id": "obfuscate", "type": "obfuscate", "params": {} }],
  "groups": {
    "obfuscate": {
      "title": "Obfuscate",
      "inputs": { "pack": "pack", "key": "key" },
      "outputs": { "pack": "pack", "mappings": "mappings" },
      "nodes": [{ "id": "input", "type": "group.input" }, { "id": "output", "type": "group.output" }],
      "links": []
    }
  }
}
```

During a run, nodes inside a group report as `group/node`, for example `obfuscate/obfuscator`, and the group node fails when anything inside it does. Groups can contain other groups, but not themselves.

## Old graphs

A graph without a Start node gets one when it is opened or run, with a white chain through its steps in data order. Older node types and port names (`references.*`, `output.translations`) load through each node's `aliases` and `renamedPorts`.
