import { extensionOf, globMatcher } from "@strata/nodes";

const CATEGORY = "Encryption";

export const FILE_TYPES = {
  images: ["png", "tga", "jpg", "jpeg"],
  json: ["json", "material"],
  sounds: ["ogg", "fsb", "wav", "mp3"],
  text: ["lang", "txt"],
};

const KNOWN = new Set(Object.values(FILE_TYPES).flat());

function byExtension(extensions) {
  const set = new Set(extensions);
  return (path) => set.has(extensionOf(path).toLowerCase());
}

function typeRule(type, title, icon, extensions) {
  return {
    type: `encrypt.${type}`,
    title,
    icon,
    category: CATEGORY,
    description: `Encrypts ${extensions.map((extension) => `.${extension}`).join(", ")} files`,
    pure: true,
    outputs: { files: "files" },
    run: () => ({ files: { title, mode: "include", match: byExtension(extensions) } }),
  };
}

export const imagesRule = typeRule("images", "Images", "image", FILE_TYPES.images);
export const jsonRule = typeRule("json", "JSON", "braces", FILE_TYPES.json);
export const soundsRule = typeRule("sounds", "Sounds", "music", FILE_TYPES.sounds);
export const textRule = typeRule("text", "Text", "text", FILE_TYPES.text);

export const otherRule = {
  type: "encrypt.other",
  title: "Other Files",
  icon: "files",
  category: CATEGORY,
  description: "Encrypts every file the Images, JSON, Sounds and Text rules do not cover",
  pure: true,
  outputs: { files: "files" },
  run: () => ({ files: { title: "Other Files", mode: "include", match: (path) => !KNOWN.has(extensionOf(path).toLowerCase()) } }),
};

export const matchRule = {
  type: "encrypt.match",
  title: "Match Files",
  icon: "target",
  category: CATEGORY,
  description: "Encrypts files matching your own patterns",
  pure: true,
  outputs: { files: "files" },
  params: {
    patterns: { type: "list", default: [], label: "Patterns", description: "*.ogg matches by name, entity/** by path" },
  },
  run: ({ params }) => ({ files: { title: "Match Files", mode: "include", match: globMatcher(params.patterns) } }),
};

export const readableRule = {
  type: "encrypt.readable",
  title: "Leave Readable",
  icon: "eye",
  category: CATEGORY,
  description: "Files that stay unencrypted even when another rule matches them",
  pure: true,
  outputs: { files: "files" },
  params: {
    patterns: { type: "list", default: [], label: "Patterns", description: "*.ogg matches by name, sounds/** by path" },
  },
  run: ({ params }) => ({ files: { title: "Leave Readable", mode: "exclude", match: globMatcher(params.patterns) } }),
};

export const fileRules = [imagesRule, jsonRule, soundsRule, textRule, otherRule, matchRule, readableRule];

export function fileSelector(rules) {
  const include = rules.filter((rule) => rule?.mode === "include");
  const exclude = rules.filter((rule) => rule?.mode === "exclude");
  return (path) => include.some((rule) => rule.match(path)) && !exclude.some((rule) => rule.match(path));
}
