import { Pack } from "@strata/core";
import { ExclusionSet } from "@strata/nodes";
import { Obfuscator } from "./obfuscator.js";
import { combineRules, ruleNodes } from "./rules.js";

const UNTOUCHED = new Set(["manifest.json", "pack_icon.png"]);
const IMAGE = /\.(png|tga|jpe?g|hdr)$/i;

export const obfuscator = {
  type: "obfuscator",
  title: "Obfuscator",
  icon: "incognito",
  category: "Obfuscation",
  description: "Hashes everything the connected rules turn on, leaving alone whatever the exclusions list. Remove a rule to keep those names as they are",
  inputs: {
    pack: "pack",
    exclusions: { type: "exclusions", multiple: true, optional: true },
    key: "key",
    rules: { type: "rule", multiple: true, optional: true },
  },
  outputs: {
    pack: "pack",
    mappings: "mappings",
  },
  async run({ inputs, context }) {
    if (inputs.exclusions.length === 0) {
      context.warn("no exclusions connected, vanilla names and paths will be hashed too");
    }
    if (inputs.rules.length === 0) {
      context.warn("no rules connected, nothing is hashed");
    }
    const { kinds, trash, hash, shuffleUi } = combineRules(inputs.rules, context.warn);
    const obfuscator = new Obfuscator(ExclusionSet.merge(inputs.exclusions), inputs.key.bytes, {
      rules: kinds,
      trash,
      hash,
      shuffleUi,
      warn: context.warn,
    });
    obfuscator.prepare(inputs.pack.files);

    const output = new Pack(new Map(), { ...inputs.pack.meta });
    for (const [path, data] of inputs.pack.files) {
      if (UNTOUCHED.has(path)) {
        output.set(path, data);
        continue;
      }
      const newPath = obfuscator.obfuscatePath(path);
      if (output.has(newPath)) {
        context.warn(`${path} maps to ${newPath}, which already exists`);
      }
      output.set(newPath, obfuscator.obfuscate(path, data));
      if (path.startsWith("textures/") && IMAGE.test(path)) {
        obfuscator.record("texturePaths", path.replace(IMAGE, ""), newPath.replace(IMAGE, ""));
      }
    }

    const mappings = obfuscator.getMappings();
    const counts = Object.entries(mappings).map(([category, group]) => `${category} ${Object.keys(group).length}`);
    context.log(`${output.size} files, mappings: ${counts.join(", ") || "none"}`);
    return { pack: output, mappings };
  },
};

export { ruleNodes };
