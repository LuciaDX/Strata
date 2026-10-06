import { readFile, writeFile } from "node:fs/promises";

export const EXCLUSION_FORMAT = "strata-exclusions";
export const EXCLUSION_VERSION = 1;
const LEGACY_FORMATS = new Set(["strata-references"]);

export const FIELDS = [
  "paths",
  "pathsNoExt",
  "geometry",
  "animations",
  "animationControllers",
  "renderControllers",
  "entities",
  "attachables",
  "particles",
  "sounds",
  "materials",
  "itemTextures",
  "terrainTextures",
  "boneNames",
  "locators",
  "shortNames",
  "uiElements",
];

function patternToRegex(pattern) {
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + escaped.join(".*") + "$");
}

export class ExclusionSet {
  constructor(fields = {}, meta = {}) {
    for (const field of FIELDS) {
      this[field] = new Set(fields[field] ?? []);
    }
    this.meta = meta;
    this.patterns = [];
    this.refreshDerived();
  }

  static async load(file) {
    const data = JSON.parse(await readFile(file, "utf8"));
    if (data.format === EXCLUSION_FORMAT || LEGACY_FORMATS.has(data.format)) {
      if (data.version > EXCLUSION_VERSION) {
        throw new Error(`${file} uses exclusion format ${data.version}, this Strata supports up to ${EXCLUSION_VERSION}`);
      }
      return new ExclusionSet(data.fields, data.meta ?? {});
    }
    return new ExclusionSet(data, { name: "legacy index" });
  }

  static merge(sets) {
    const merged = new ExclusionSet({}, { sources: sets.map((set) => set.meta) });
    for (const set of sets) {
      for (const field of FIELDS) {
        for (const value of set[field]) {
          merged[field].add(value);
        }
      }
      merged.patterns.push(...set.patterns);
    }
    merged.refreshDerived();
    return merged;
  }

  static fromPatterns(entries, meta = {}) {
    const set = new ExclusionSet({}, meta);
    for (const entry of entries) {
      if (entry.includes("*")) {
        set.patterns.push(patternToRegex(entry));
      } else {
        for (const field of FIELDS) {
          set[field].add(entry);
        }
      }
    }
    set.refreshDerived();
    return set;
  }

  refreshDerived() {
    this.uiNamespaces = new Set([...this.uiElements].map((element) => (element.includes(".") ? element.slice(0, element.indexOf(".")) : element)));
  }

  has(field, value) {
    return this[field].has(value) || this.patterns.some((pattern) => pattern.test(value));
  }

  toJSON() {
    const fields = {};
    for (const field of FIELDS) {
      fields[field] = [...this[field]].sort();
    }
    return { format: EXCLUSION_FORMAT, version: EXCLUSION_VERSION, meta: this.meta, fields };
  }

  async save(file) {
    await writeFile(file, JSON.stringify(this.toJSON()));
  }

  isPath(path) {
    return this.has("paths", path);
  }

  isPathNoExt(path) {
    return this.has("pathsNoExt", path);
  }

  isGeometry(id) {
    return this.has("geometry", id);
  }

  isAnimation(id) {
    return this.has("animations", id);
  }

  isAnimationController(id) {
    return this.has("animationControllers", id);
  }

  isRenderController(id) {
    return this.has("renderControllers", id);
  }

  isEntity(id) {
    return this.has("entities", id);
  }

  isAttachable(id) {
    return this.has("attachables", id);
  }

  isParticle(id) {
    return this.has("particles", id);
  }

  isSound(id) {
    return this.has("sounds", id);
  }

  isMaterial(id) {
    return this.has("materials", id);
  }

  isItemTexture(id) {
    return this.has("itemTextures", id);
  }

  isTerrainTexture(id) {
    return this.has("terrainTextures", id);
  }

  isBone(name) {
    return this.has("boneNames", name);
  }

  isLocator(name) {
    return this.has("locators", name);
  }

  isShortName(name) {
    return this.has("shortNames", name);
  }

  isUiNamespace(namespace) {
    return this.uiNamespaces.has(namespace) || this.patterns.some((pattern) => pattern.test(namespace) || pattern.test(namespace + "."));
  }

  isUiElement(namespace, name) {
    return this.has("uiElements", namespace + "." + name);
  }
}
