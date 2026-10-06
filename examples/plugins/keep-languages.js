import { Pack } from "@strata/core";

export const keepLanguages = {
  type: "example.keep-languages",
  title: "Keep Languages",
  category: "Examples",
  description: "Removes every .lang file except the listed languages",
  inputs: {
    pack: "pack",
  },
  outputs: {
    pack: "pack",
  },
  params: {
    languages: { type: "list", default: ["en_US"] },
  },
  async run({ inputs, params, context }) {
    const keep = new Set(params.languages.map((language) => `texts/${language}.lang`));
    const output = new Pack(new Map(), { ...inputs.pack.meta });
    let removed = 0;
    for (const [path, data] of inputs.pack.files) {
      if (path.startsWith("texts/") && path.endsWith(".lang") && !keep.has(path)) {
        removed++;
        continue;
      }
      output.set(path, data);
    }
    context.log(`removed ${removed} language files`);
    return { pack: output };
  },
};
