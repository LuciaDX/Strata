import { ExclusionSet } from "./exclusion-set.js";
import { scanPacks } from "./scanner.js";

const cache = new Map();

export async function loadExclusionFile(file) {
  let set = cache.get(file);
  if (!set) {
    set = ExclusionSet.load(file);
    cache.set(file, set);
  }
  return set;
}

export const exclusionFile = {
  type: "exclusions.file",
  pure: true,
  aliases: ["references.file"],
  renamedPorts: { references: "exclusions" },
  title: "Exclusion File",
  icon: "shield",
  category: "Exclusions",
  description: "Names and paths another pack uses, such as vanilla, which obfuscation must leave alone",
  outputs: {
    exclusions: "exclusions",
  },
  params: {
    path: { type: "file", required: true },
  },
  async run({ params, context }) {
    const set = await loadExclusionFile(context.resolve(params.path));
    const label = set.meta.name ?? params.path;
    const version = set.meta.gameVersion ? ` ${set.meta.gameVersion}` : "";
    context.log(`${label}${version}: ${set.paths.size} paths, ${set.entities.size} entities, ${set.sounds.size} sounds`);
    return { exclusions: set };
  },
};

export const scanExclusions = {
  type: "exclusions.scan",
  pure: true,
  aliases: ["references.scan"],
  renamedPorts: { references: "exclusions" },
  title: "Scan Packs",
  icon: "scan",
  category: "Exclusions",
  description: "Builds exclusions from a pack folder, or a folder of packs such as the game's vanilla packs",
  outputs: {
    exclusions: "exclusions",
  },
  params: {
    path: { type: "folder", required: true },
    name: { type: "string" },
    save: { type: "file", mode: "save" },
  },
  async run({ params, context }) {
    const set = await scanPacks(context.resolve(params.path), { name: params.name });
    context.log(`${set.meta.packs.length} packs, ${set.paths.size} paths, ${set.entities.size} entities, ${set.sounds.size} sounds`);
    if (params.save) {
      await set.save(context.resolve(params.save));
      context.log(`saved to ${context.resolve(params.save)}`);
    }
    return { exclusions: set };
  },
};

export const keepNames = {
  type: "exclusions.keep",
  pure: true,
  aliases: ["references.keep"],
  renamedPorts: { references: "exclusions" },
  title: "Keep Names",
  icon: "bookmark",
  category: "Exclusions",
  description: "Names, ids and paths to leave unhashed, with * as a wildcard",
  outputs: {
    exclusions: "exclusions",
  },
  params: {
    names: { type: "list", default: [] },
  },
  async run({ params, context }) {
    const entries = params.names.filter((entry) => typeof entry === "string" && entry !== "");
    context.log(`${entries.length} entries`);
    return { exclusions: ExclusionSet.fromPatterns(entries, { name: "Keep Names" }) };
  },
};
