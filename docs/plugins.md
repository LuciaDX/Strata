# Plugins

Strata loads nodes from two folders, in this order:

1. **Built-in plugins**: `Strata/plugins` in this repo, and `resources/plugins` inside a release (`Strata.app/Contents/Resources/plugins` on macOS).
2. **Your plugins**: the folder Open plugins folder at the bottom of the library opens. It is `%APPDATA%\Strata\plugins` on Windows, `~/Library/Application Support/Strata/plugins` on macOS and `~/.config/Strata/plugins` on Linux, and it survives updating the app.

A node or group in your folder with the same type as a built-in one replaces it, so to change a built-in plugin, copy its folder into yours and edit the copy. Plugins a graph lists under `"plugins"` load after both. The processing nodes ship as plain source:

| Plugin | What it is |
|---|---|
| `obfuscate/` | Obfuscate: `obfuscate.group.json` is the group, `index.js` the Obfuscator node, `rules.js` the rule nodes, `obfuscator.js` every format rule, `hash.js` the hashing, `trash.js` the trash path settings |
| `encrypt/` | Encrypt: `encrypt.group.json` is the group, `index.js` the Encrypt Files node, `rules.js` the file rules and the extensions each one covers |
| `brarchive/` | BrArchive: `brarchive.group.json` is the group, `index.js` the Archive Folders and Mark Optimized nodes |

Patterns use `*` and `?` within a name and `**` across folders. A pattern without `/` matches the file name anywhere (`*.ogg`), one with `/` matches the whole path (`sounds/**`). Plugins get the same matcher as `globMatcher` from `@strata/nodes`.

Every run in the workbench loads the plugins fresh in its own background thread, so an edit to a node's code applies from the next run. New node types, and changes to a node's ports or settings, show up in the library after a restart. Delete a plugin file and its node disappears; graphs that use it show the node as missing until it is back.

## Loading

Every `.js` or `.mjs` file in the folder is a plugin, and so is every subfolder with an `index.js` or `index.mjs`. Each exported object with a string `type` and a `run` function becomes a node; an exported array of such objects works too. Every `*.group.json` file, in the folder or in a plugin subfolder, becomes a group node.

A plugin whose `type` matches a built-in node replaces it, so the built-in Folder, Key or Write nodes can be swapped the same way. Graphs can also load extra folders with `"plugins": ["relative/path"]`, and the CLI takes `--plugins <folder>`.

## Groups

A group file is a graph with an interface:

```json
{
  "format": "strata-group",
  "type": "my.group",
  "title": "My Group",
  "category": "Processing",
  "description": "Shown in the inspector",
  "inputs": { "pack": "pack" },
  "outputs": { "pack": "pack" },
  "nodes": [
    { "id": "input", "type": "group.input", "position": { "x": 0, "y": 0 } },
    { "id": "output", "type": "group.output", "position": { "x": 700, "y": 0 } }
  ],
  "links": [{ "from": "input.then", "to": "output.exec" }, { "from": "input.pack", "to": "output.pack" }]
}
```

`inputs` and `outputs` take the same port forms as a node. Group Input gets one output per group input plus the white `then`; Group Output gets one input per group output. A `multiple` group input arrives inside as one list that spreads into `multiple` inputs. `legacyParams` maps settings an older node had to settings of nodes inside (`{ "trashPaths": "paths.trash" }`), so graphs saved before the node became a group keep their values.

The easiest way to write one is to edit a group in the workbench and copy it out of the saved graph's `"groups"`.

## Strata API

Plugins import shared code from two modules, which resolve from any folder:

- `@strata/core`: `Pack`, `Registry`, `runGraph`, the JSON helpers (`parseJson`, `stringifyJson`, `isObject`, `isArray`, `isPrimitive`, `asString`, `toPlain`, `RawNumber`), `EXEC`.
- `@strata/nodes`: `Key`, `ExclusionSet`, `scanPacks`, `readManifest`, brarchive (`readBrarchive`, `writeBrarchive`, `isBrarchive`, `archivePath`, `archiveFolder`), encryption (`encryptBytes`, `decryptBytes`, `writeContents`, `readContents`), paths (`extensionOf`, `stripExtension`, `FILE_EXTENSIONS`), `globMatcher` and `writeZip`.

## Node definition

```js
export const myNode = {
  type: "my.node",
  title: "My Node",
  icon: "cog",
  category: "Processing",
  description: "Shown in the inspector",
  inputs: { pack: "pack" },
  outputs: { pack: "pack" },
  params: {
    level: { type: "number", default: 3, min: 1, max: 9 },
  },
  async run({ inputs, params, context }) {
    context.log(`level ${params.level}`);
    return { pack: inputs.pack };
  },
};
```

- **Icon** is one of the icons bundled with the workbench: `play`, `stop`, `folder`, `key`, `lock`, `archive`, `incognito`, `shield`, `filter`, `merge`, `pencil`, `braces`, `text`, `image`, `music`, `film`, `cube`, `stack`, `tag`, `paint`, `sparkles`, `window`, `earth`, `hashtag`, `hierarchy`, `user`, `files`, `target`, `eye`, `flash`, `box`, `link`, `cog`, `code`, `shuffle` and more (the full list is `ICON_NAMES` in `apps/workbench/renderer/src/components/Icon.jsx`). Without one, the node uses its category's icon. Group files take an `icon` too.
- **Ports** are `name: "type"` or `{ type, optional, multiple }`. A `multiple` input receives an array.
- **Settings** types: `string`, `number` (`min`, `max`, `step`), `boolean`, `choice` (`options`), `list`, `file` / `folder` (`mode: "save"`, `extensions`), `key`. Any setting can have `default`, `required`, `label`, `description` (shown under the field), and `when: "otherSetting"` to show it only while that setting is on.
- **Flow**: a node is a step with white pins unless it sets `pure: true`. `growOutputs: "then"` gives it white outputs that grow as they are connected (see `graphs.md`).
- **Renames**: `aliases: ["old.type"]` and `renamedPorts: { old: "new" }` keep saved graphs loading after a node is renamed.
- **Context**: `context.log(message)`, `context.warn(message)`, `context.resolve(path)` (relative to the graph file) and `context.nodeId`.
