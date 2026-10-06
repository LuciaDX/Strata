import { Pack } from "@strata/core";
import { readFolder } from "./formats/folder.js";

export const sourceFolder = {
  type: "source.folder",
  pure: true,
  title: "Folder",
  icon: "folder",
  category: "Input",
  description: "Loads a resource pack from a folder",
  outputs: {
    pack: "pack",
  },
  params: {
    path: { type: "folder", required: true },
    exclude: { type: "list", default: [] },
  },
  async run({ params, context }) {
    const root = context.resolve(params.path);
    const exclude = new Set(params.exclude);
    const pack = new Pack();
    for (const [path, data] of await readFolder(root)) {
      if (!exclude.has(path)) {
        pack.set(path, data);
      }
    }
    context.log(`${pack.size} files from ${root}`);
    return { pack };
  },
};
