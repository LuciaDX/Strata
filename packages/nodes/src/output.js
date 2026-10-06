import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeZip } from "./formats/zip.js";

export const outputFolder = {
  type: "output.folder",
  title: "Write Folder",
  icon: "folder",
  category: "Output",
  description: "Writes a pack to a folder",
  inputs: {
    pack: "pack",
  },
  params: {
    path: { type: "folder", mode: "save", required: true },
    clean: { type: "boolean", default: true },
  },
  async run({ inputs, params, context }) {
    const root = context.resolve(params.path);
    if (params.clean) {
      await rm(root, { recursive: true, force: true });
    }
    for (const [path, data] of inputs.pack.files) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    }
    context.log(`${inputs.pack.size} files to ${root}`);
  },
};

export const outputZip = {
  type: "output.zip",
  title: "Write Zip",
  icon: "box",
  category: "Output",
  description: "Writes a pack to a .zip or .mcpack file",
  inputs: {
    pack: "pack",
  },
  params: {
    path: { type: "file", mode: "save", required: true, extensions: ["zip", "mcpack"] },
  },
  async run({ inputs, params, context }) {
    const target = context.resolve(params.path);
    const entries = new Map();
    if (inputs.pack.has("manifest.json")) {
      entries.set("manifest.json", inputs.pack.get("manifest.json"));
    }
    for (const [path, data] of inputs.pack.files) {
      entries.set(path, data);
    }
    const zip = writeZip(entries);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, zip);
    context.log(`${entries.size} files, ${(zip.length / 1024 / 1024).toFixed(2)} MB to ${target}`);
  },
};

export const outputKey = {
  type: "output.key",
  title: "Write Key",
  icon: "key",
  category: "Output",
  description: "Writes a key to a file the way the server reads it: a text key as typed, a symbols key as hex. Usually saved next to the pack as <pack>.key",
  inputs: {
    key: "key",
  },
  params: {
    path: { type: "file", mode: "save", required: true, extensions: ["key", "txt"] },
  },
  async run({ inputs, params, context }) {
    const target = context.resolve(params.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, inputs.key.serverText);
    context.log(`${inputs.key.mode} key to ${target}`);
  },
};

export const outputMappings = {
  type: "output.mappings",
  aliases: ["output.translations"],
  renamedPorts: { translations: "mappings" },
  title: "Write Mappings",
  icon: "link",
  category: "Output",
  description: "Writes the original to obfuscated name mappings the server uses, grouped by category",
  inputs: {
    mappings: "mappings",
  },
  params: {
    path: { type: "file", mode: "save", required: true },
  },
  async run({ inputs, params, context }) {
    const target = context.resolve(params.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(inputs.mappings, null, 2) + "\n");
    context.log(`mappings to ${target}`);
  },
};

export const outputJson = {
  type: "output.json",
  title: "Write JSON",
  icon: "braces",
  category: "Output",
  description: "Writes any value, such as mappings or keys, to a JSON file",
  inputs: {
    value: "any",
  },
  params: {
    path: { type: "file", mode: "save", required: true },
  },
  async run({ inputs, params, context }) {
    const target = context.resolve(params.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(inputs.value, null, 2) + "\n");
    context.log(`wrote ${target}`);
  },
};
