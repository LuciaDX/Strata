import { randomUUID } from "node:crypto";
import { Pack, isArray, isObject, stringifyJson } from "@strata/core";
import { globMatcher } from "./formats/glob.js";
import { readFolder } from "./formats/folder.js";
import { readManifest } from "./formats/manifest.js";

const CATEGORY = "Pack";
const MANIFEST = "manifest.json";

function parseVersion(text) {
  const parts = String(text).trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Version "${text}" must look like 1.2.3`);
  }
  return parts.map(Number);
}

function filled(value) {
  return typeof value === "string" && value.trim() !== "";
}

export const editManifest = {
  type: "pack.manifest",
  title: "Edit Manifest",
  icon: "pencil",
  category: CATEGORY,
  description: "Changes manifest.json: name, description, version and UUIDs. Empty settings keep what the pack has",
  pure: true,
  inputs: {
    pack: "pack",
  },
  outputs: {
    pack: "pack",
  },
  params: {
    name: { type: "string", default: "", label: "Name" },
    description: { type: "string", default: "", label: "Description" },
    version: { type: "string", default: "", label: "Version", description: "Like 1.2.3, set on the header and every module. The game caches packs by UUID and version" },
    newUuids: { type: "boolean", default: false, label: "New UUIDs", description: "Random header and module UUIDs on every run, so the game treats the result as a new pack" },
    minEngineVersion: { type: "string", default: "", label: "Min engine version", description: "Like 1.21.0" },
  },
  run({ inputs, params, context }) {
    const output = inputs.pack.clone();
    const { manifest, header } = readManifest(output);
    const modules = isArray(manifest.get("modules")) ? manifest.get("modules").filter(isObject) : [];
    const changes = [];
    if (filled(params.name)) {
      header.set("name", params.name);
      changes.push("name");
    }
    if (filled(params.description)) {
      header.set("description", params.description);
      changes.push("description");
    }
    if (filled(params.version)) {
      const version = parseVersion(params.version);
      header.set("version", version);
      for (const module of modules) {
        module.set("version", [...version]);
      }
      changes.push(`version ${version.join(".")}`);
    }
    if (params.newUuids) {
      header.set("uuid", randomUUID());
      for (const module of modules) {
        module.set("uuid", randomUUID());
      }
      changes.push("new UUIDs");
    }
    if (filled(params.minEngineVersion)) {
      header.set("min_engine_version", parseVersion(params.minEngineVersion));
      changes.push(`min engine ${params.minEngineVersion.trim()}`);
    }
    output.set(MANIFEST, stringifyJson(manifest));
    context.log(changes.length > 0 ? changes.join(", ") : "nothing changed");
    return { pack: output };
  },
};

export const filterFiles = {
  type: "pack.filter",
  title: "Filter Files",
  icon: "filter",
  category: CATEGORY,
  description: "Keeps the files matching Include and drops those matching Exclude. *.png matches by name, textures/** by path",
  pure: true,
  inputs: {
    pack: "pack",
  },
  outputs: {
    pack: "pack",
  },
  params: {
    include: { type: "list", default: ["**"], label: "Include" },
    exclude: { type: "list", default: [], label: "Exclude" },
  },
  run({ inputs, params, context }) {
    const included = globMatcher(params.include);
    const excluded = globMatcher(params.exclude);
    const output = new Pack(new Map(), { ...inputs.pack.meta });
    for (const [path, data] of inputs.pack.files) {
      if (included(path) && !excluded(path)) {
        output.set(path, data);
      }
    }
    if (inputs.pack.has(MANIFEST) && !output.has(MANIFEST)) {
      context.warn("manifest.json was filtered out");
    }
    context.log(`kept ${output.size} of ${inputs.pack.size} files`);
    return { pack: output };
  },
};

export const mergePacks = {
  type: "pack.merge",
  title: "Merge Packs",
  icon: "merge",
  category: CATEGORY,
  description: "Combines packs into one, in connection order. The first pack's manifest is kept",
  pure: true,
  inputs: {
    packs: { type: "pack", multiple: true },
  },
  outputs: {
    pack: "pack",
  },
  params: {
    conflicts: { type: "choice", options: ["later wins", "first wins"], default: "later wins", label: "Same path" },
  },
  run({ inputs, params, context }) {
    if (inputs.packs.length === 0) {
      throw new Error("Connect at least one pack");
    }
    const output = new Pack(new Map(), { ...inputs.packs[0].meta });
    let replaced = 0;
    for (const [index, pack] of inputs.packs.entries()) {
      for (const [path, data] of pack.files) {
        if (path === MANIFEST && index > 0) {
          continue;
        }
        if (output.has(path)) {
          replaced++;
          if (params.conflicts === "first wins") {
            continue;
          }
        }
        output.set(path, data);
      }
    }
    context.log(`${inputs.packs.length} packs, ${output.size} files, ${replaced} shared paths`);
    return { pack: output };
  },
};

export const addFiles = {
  type: "pack.add",
  title: "Add Files",
  icon: "file-add",
  category: CATEGORY,
  description: "Copies a folder's files into the pack",
  pure: true,
  inputs: {
    pack: "pack",
  },
  outputs: {
    pack: "pack",
  },
  params: {
    path: { type: "folder", required: true, label: "Folder" },
    target: { type: "string", default: "", label: "Into", description: "Folder inside the pack, empty for the root" },
    overwrite: { type: "boolean", default: true, label: "Overwrite existing" },
  },
  async run({ inputs, params, context }) {
    const root = context.resolve(params.path);
    const prefix = String(params.target ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const output = inputs.pack.clone();
    let added = 0;
    let kept = 0;
    for (const [path, data] of await readFolder(root)) {
      const target = prefix ? `${prefix}/${path}` : path;
      if (output.has(target) && !params.overwrite) {
        kept++;
        continue;
      }
      output.set(target, data);
      added++;
    }
    context.log(`${added} files from ${root}${kept > 0 ? `, ${kept} existing kept` : ""}`);
    return { pack: output };
  },
};

export const packTools = [editManifest, filterFiles, mergePacks, addFiles];
