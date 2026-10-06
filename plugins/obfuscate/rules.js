import { DEFAULT_TRASH, DEPTH_LIMIT, trashSettings } from "./trash.js";
import { DEFAULT_HASH, HASH_ALGORITHMS, HASH_STYLES, maxHashLength } from "./hash.js";

const CATEGORY = "Obfuscation";

const keepParam = { type: "list", default: [], label: "Keep names", description: "Names this rule leaves alone, * matches anything" };

function toggle(label) {
  return { type: "boolean", default: true, label };
}

function patternOf(pattern) {
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escaped.join(".*")}$`);
}

export function keepMatcher(patterns) {
  const exact = new Set();
  const wild = [];
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      wild.push(patternOf(pattern));
    } else {
      exact.add(pattern);
    }
  }
  return (name) => exact.has(name) || wild.some((regex) => regex.test(name));
}

function cleanList(list) {
  return (Array.isArray(list) ? list : []).map((entry) => String(entry).trim()).filter(Boolean);
}

function rule(type, title, icon, description, kinds, extra = {}) {
  const switches = Object.entries(kinds).filter(([, label]) => label !== null);
  const params = Object.fromEntries(switches.map(([kind, label]) => [kind, toggle(label)]));
  return {
    type: `obfuscate.${type}`,
    title,
    icon,
    category: CATEGORY,
    description,
    pure: true,
    outputs: { rule: "rule" },
    params: { ...params, ...(extra.params ?? {}), keep: keepParam },
    run({ params: values }) {
      const enabled = Object.entries(kinds)
        .filter(([kind, label]) => label === null || values[kind] !== false)
        .map(([kind]) => kind);
      return { rule: { title, kinds: enabled, keep: cleanList(values.keep), ...(extra.build?.(values) ?? {}) } };
    },
  };
}

export const pathsRule = rule("paths", "File Paths", "hierarchy", "Hashes folder and file names, and every reference to them", { paths: null }, {
  params: {
    trash: { type: "boolean", default: false, label: "Trash paths" },
    trashMinDepth: { type: "number", default: DEFAULT_TRASH.minDepth, min: 1, max: DEPTH_LIMIT, label: "Min depth", when: "trash" },
    trashMaxDepth: { type: "number", default: DEFAULT_TRASH.maxDepth, min: 1, max: DEPTH_LIMIT, label: "Max depth", when: "trash" },
  },
  build: (values) => ({ trash: trashSettings({ trashPaths: values.trash, trashMinDepth: values.trashMinDepth, trashMaxDepth: values.trashMaxDepth }) }),
});

export const entitiesRule = rule("entities", "Entities", "user", "Hashes client entity and attachable identifiers, with their lang names and sound keys", { entities: null });

export const animationsRule = rule("animations", "Animations", "film", "Hashes animation and animation controller ids, plus controller state names", {
  animations: "Animations",
  controllers: "Animation controllers",
});

export const modelsRule = rule("models", "Models", "cube", "Hashes geometry ids, bone names and locators", {
  geometry: "Geometry",
  bones: "Bones",
  locators: "Locators",
});

export const renderControllersRule = rule("render_controllers", "Render Controllers", "stack", "Hashes render controller ids and their array names", { renderControllers: null });

export const shortNamesRule = rule("short_names", "Short Names", "tag", "Hashes the short names entities give their animations, textures, geometry and materials", { shortNames: null });

export const materialsRule = rule("materials", "Materials", "paint", "Hashes material names", { materials: null });

export const particlesRule = rule("particles", "Particles", "sparkles", "Hashes particle identifiers", { particles: null });

export const soundsRule = rule("sounds", "Sounds", "music", "Hashes sound event and definition names", { sounds: null });

export const texturesRule = rule("textures", "Texture Atlases", "image", "Hashes item_texture and terrain_texture keys", {
  itemTextures: "Item atlas",
  terrainTextures: "Terrain atlas",
});

export const uiRule = rule("ui", "UI", "window", "Hashes custom UI namespaces, elements and control names", { ui: null }, {
  params: {
    shuffle: { type: "boolean", default: true, label: "Shuffle order", description: "Reorders elements and their properties in every UI file. Lists such as controls keep their order, so nothing changes in game" },
  },
  build: (values) => ({ shuffleUi: values.shuffle !== false }),
});

export const worldRule = rule("world", "World", "earth", "Hashes fog and block culling identifiers", {
  fogs: "Fogs",
  culling: "Block culling rules",
});

export const hashFormat = {
  type: "obfuscate.hash",
  title: "Hash Format",
  icon: "hashtag",
  category: CATEGORY,
  description: "How hashed names look. Longer hashes are safer against collisions",
  pure: true,
  outputs: { rule: "rule" },
  params: {
    algorithm: { type: "choice", options: Object.keys(HASH_ALGORITHMS), default: DEFAULT_HASH.algorithm, label: "Algorithm" },
    style: { type: "choice", options: HASH_STYLES, default: DEFAULT_HASH.style, label: "Characters" },
    length: { type: "number", default: DEFAULT_HASH.length, min: 4, max: 64, label: "Length" },
    prefix: { type: "string", default: "", label: "Prefix" },
  },
  run({ params }) {
    const algorithm = params.algorithm in HASH_ALGORITHMS ? params.algorithm : DEFAULT_HASH.algorithm;
    const style = HASH_STYLES.includes(params.style) ? params.style : DEFAULT_HASH.style;
    const limit = maxHashLength(algorithm, style);
    const length = Number(params.length);
    if (!Number.isInteger(length) || length < 4 || length > limit) {
      throw new Error(`Length must be a whole number from 4 to ${limit} for ${algorithm} ${style}`);
    }
    const prefix = String(params.prefix ?? "");
    if (!/^[a-z0-9_]*$/.test(prefix)) {
      throw new Error("Prefix can only use lowercase letters, digits and _");
    }
    return { rule: { title: "Hash Format", kinds: [], keep: [], hash: { algorithm, style, length, prefix } } };
  },
};

export const ruleNodes = [
  hashFormat,
  pathsRule,
  entitiesRule,
  animationsRule,
  modelsRule,
  renderControllersRule,
  shortNamesRule,
  materialsRule,
  particlesRule,
  soundsRule,
  texturesRule,
  uiRule,
  worldRule,
];

export function combineRules(rules, warn) {
  const patterns = new Map();
  let trash = null;
  let hash = null;
  let shuffleUi = false;
  for (const entry of rules) {
    if (!entry) {
      continue;
    }
    for (const kind of entry.kinds) {
      const list = patterns.get(kind) ?? [];
      list.push(...entry.keep);
      patterns.set(kind, list);
    }
    if (entry.shuffleUi) {
      shuffleUi = true;
    }
    if (entry.trash) {
      trash = entry.trash;
    }
    if (entry.hash) {
      if (hash) {
        warn("more than one Hash Format is connected, the last one wins");
      }
      hash = entry.hash;
    }
  }
  const kinds = new Map([...patterns].map(([kind, list]) => [kind, keepMatcher(list)]));
  return { kinds, trash, hash, shuffleUi };
}
