import { Pack, stringifyJson } from "@strata/core";
import { ARCHIVE_PREFIX, archivePath, globMatcher, readManifest, writeBrarchive } from "@strata/nodes";

const OPTIMIZATION_VERSION = [0, 1, 0];

function isArchivable(path) {
  return path.endsWith(".json") && !path.endsWith(".texture_set.json") && path.includes("/") && !path.startsWith(ARCHIVE_PREFIX);
}

export const archiveFolders = {
  type: "brarchive.folders",
  title: "Archive Folders",
  icon: "archive",
  category: "Archiving",
  description: "Bundles every folder's JSON files into one __brarchive file, the way vanilla ships",
  inputs: {
    pack: "pack",
  },
  outputs: {
    pack: "pack",
  },
  params: {
    skip: { type: "list", default: [], label: "Keep loose", description: "JSON files left outside the archives. *.json matches by name, entity/** by path" },
  },
  async run({ inputs, params, context }) {
    const skipped = globMatcher(params.skip);
    const output = new Pack(new Map(), { ...inputs.pack.meta, archived: true });
    const folders = new Map();
    for (const [path, data] of inputs.pack.files) {
      if (!isArchivable(path) || skipped(path)) {
        output.set(path, data);
        continue;
      }
      const slash = path.lastIndexOf("/");
      const folder = path.slice(0, slash);
      const entries = folders.get(folder) ?? new Map();
      entries.set(path.slice(slash + 1), data);
      folders.set(folder, entries);
    }

    let archived = 0;
    for (const [folder, entries] of folders) {
      output.set(archivePath(folder), writeBrarchive(entries));
      archived += entries.size;
    }
    context.log(`${archived} files in ${folders.size} archives, ${output.size} files total`);
    return { pack: output };
  },
};

export const markOptimized = {
  type: "manifest.optimized",
  title: "Mark Optimized",
  icon: "flash",
  category: "Archiving",
  description: "Sets pack_optimization_version in manifest.json, which tells the game the pack ships archives",
  inputs: {
    pack: "pack",
  },
  outputs: {
    pack: "pack",
  },
  async run({ inputs, context }) {
    const output = inputs.pack.clone();
    if (!output.has("manifest.json")) {
      context.warn("no manifest.json, so the pack is not marked as optimized");
      return { pack: output };
    }
    const { manifest, header } = readManifest(output);
    header.set("pack_optimization_version", OPTIMIZATION_VERSION);
    output.set("manifest.json", stringifyJson(manifest));
    context.log(`pack_optimization_version ${OPTIMIZATION_VERSION.join(".")}`);
    return { pack: output };
  },
};
