import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { parseJson, isObject, isArray, asString } from "@strata/core";
import { ExclusionSet } from "./exclusion-set.js";
import { isBrarchive, readBrarchive } from "../formats/brarchive.js";
import { stripExtension } from "../formats/paths.js";

const MCB_MAGIC = Buffer.from([0x7f, 0x4d, 0x43, 0x42]);
const PARTICLE_EFFECT = Buffer.from("particle_effect", "utf8");
const RC_REF = /\b(Geometry|Texture|Material)\.([A-Za-z0-9_]+)/gi;
const ENTITY_MAPS = ["textures", "geometry", "materials", "animations", "particle_effects", "sound_effects", "particle_emitters"];

function get(value, key) {
  return isObject(value) ? value.get(key) : undefined;
}

function entriesOf(value) {
  return isObject(value) ? [...value] : [];
}

function namesOf(list) {
  const names = [];
  for (const entry of isArray(list) ? list : []) {
    if (typeof entry === "string") {
      names.push(entry);
    } else if (isObject(entry)) {
      names.push(...entry.keys());
    }
  }
  return names;
}

function forEachString(value, action) {
  if (typeof value === "string") {
    action(value);
  } else if (isArray(value)) {
    value.forEach((entry) => forEachString(entry, action));
  } else if (isObject(value)) {
    for (const [key, entry] of value) {
      action(key);
      forEachString(entry, action);
    }
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function isPackFolder(folder) {
  try {
    return (await stat(join(folder, "manifest.json"))).isFile();
  } catch {
    return false;
  }
}

export async function findPacks(folder) {
  if (await isPackFolder(folder)) {
    return [folder];
  }
  const packs = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isDirectory() && (await isPackFolder(join(folder, entry.name)))) {
      packs.push(join(folder, entry.name));
    }
  }
  return packs.sort();
}

function keepNonEmpty(files, path, data) {
  const existing = files.get(path);
  if (existing === undefined || (existing.length === 0 && data.length > 0)) {
    files.set(path, data);
  }
}

export async function loadPackFiles(root) {
  const files = new Map();
  const archives = [];
  for (const file of await walk(root)) {
    const path = relative(root, file).split("\\").join("/");
    if (path.startsWith("__brarchive/") && path.endsWith(".brarchive")) {
      archives.push([path, file]);
    } else {
      keepNonEmpty(files, path, await readFile(file));
    }
  }
  for (const [path, file] of archives) {
    const data = await readFile(file);
    if (!isBrarchive(data)) {
      continue;
    }
    const folder = path.slice("__brarchive/".length, -".brarchive".length);
    for (const [name, entry] of readBrarchive(data)) {
      keepNonEmpty(files, folder + "/" + name, entry);
    }
  }
  return files;
}

function mcbParticleId(data) {
  let index = data.indexOf(PARTICLE_EFFECT);
  while (index > 0) {
    if (data[index - 1] === PARTICLE_EFFECT.length) {
      const lengthAt = index + PARTICLE_EFFECT.length;
      const length = data[lengthAt];
      if (lengthAt + 1 + length <= data.length) {
        return data.toString("utf8", lengthAt + 1, lengthAt + 1 + length);
      }
    }
    index = data.indexOf(PARTICLE_EFFECT, index + 1);
  }
  return null;
}

export class Scanner {
  constructor(set) {
    this.set = set;
  }

  add(field, value) {
    if (typeof value === "string" && value !== "") {
      this.set[field].add(value);
    }
  }

  addParts(field, value) {
    if (typeof value === "string") {
      value.split(":").forEach((part) => this.add(field, part));
    }
  }

  scanFiles(files) {
    for (const [path, data] of files) {
      this.add("paths", path);
      this.add("pathsNoExt", stripExtension(path));
      if (data.length === 0 || !(path.endsWith(".json") || path.endsWith(".material"))) {
        continue;
      }
      if (data.subarray(0, 4).equals(MCB_MAGIC)) {
        if (path.startsWith("particles/")) {
          this.add("particles", mcbParticleId(data));
        }
        continue;
      }
      let json;
      try {
        json = parseJson(data);
      } catch {
        continue;
      }
      this.scanJson(path, json);
    }
  }

  scanJson(path, json) {
    const top = path.includes("/") ? path.slice(0, path.indexOf("/")) : "";
    switch (top) {
      case "entity":
        this.scanClientEntity(get(get(json, "minecraft:client_entity"), "description"), "entities");
        break;
      case "attachables":
        this.scanClientEntity(get(get(json, "minecraft:attachable"), "description"), "attachables");
        break;
      case "models":
        this.scanGeometry(json);
        break;
      case "animations":
        this.scanAnimations(json);
        break;
      case "animation_controllers":
        this.scanAnimationControllers(json);
        break;
      case "render_controllers":
        this.scanRenderControllers(json);
        break;
      case "materials":
        for (const [key] of entriesOf(get(json, "materials"))) {
          if (key !== "version") {
            this.addParts("materials", key);
          }
        }
        break;
      case "particles":
        this.scanParticle(json);
        break;
      case "sounds":
        if (path === "sounds/sound_definitions.json") {
          const definitions = isObject(get(json, "sound_definitions")) ? get(json, "sound_definitions") : json;
          for (const [name] of entriesOf(definitions)) {
            if (name !== "format_version") {
              this.add("sounds", name);
            }
          }
        }
        break;
      case "textures":
        if (path === "textures/item_texture.json") {
          entriesOf(get(json, "texture_data")).forEach(([key]) => this.add("itemTextures", key));
        } else if (path === "textures/terrain_texture.json") {
          entriesOf(get(json, "texture_data")).forEach(([key]) => this.add("terrainTextures", key));
        }
        break;
      case "ui":
        if (typeof get(json, "namespace") === "string") {
          const namespace = json.get("namespace");
          for (const key of json.keys()) {
            if (key !== "namespace") {
              this.add("uiElements", namespace + "." + key.split("@")[0]);
            }
          }
        }
        break;
      case "block_culling": {
        const rules = get(get(json, "minecraft:block_culling_rules"), "rules");
        for (const rule of isArray(rules) ? rules : []) {
          this.add("boneNames", asString(get(get(rule, "geometry_part"), "bone")));
        }
        break;
      }
      default:
        if (path === "sounds.json") {
          entriesOf(get(get(json, "individual_event_sounds"), "events")).forEach(([key]) => this.add("sounds", key));
          entriesOf(get(get(json, "individual_named_sounds"), "sounds")).forEach(([key]) => this.add("sounds", key));
        }
    }
  }

  scanClientEntity(description, field) {
    if (!isObject(description)) {
      return;
    }
    this.add(field, asString(description.get("identifier")));
    for (const map of ENTITY_MAPS) {
      for (const [key, value] of entriesOf(description.get(map))) {
        this.add("shortNames", key);
        const target = asString(value);
        if (target === null) {
          continue;
        }
        if (map === "materials") {
          this.addParts("materials", target);
        } else if (map === "particle_effects") {
          this.add("particles", target);
        } else if (map === "sound_effects") {
          this.add("sounds", target);
        } else if (map === "geometry") {
          this.addParts("geometry", target);
        } else if (map === "animations" || map === "particle_emitters") {
          this.add(target.startsWith("controller.animation.") ? "animationControllers" : "animations", target);
        }
      }
    }
    for (const entry of isArray(description.get("animation_controllers")) ? description.get("animation_controllers") : []) {
      for (const [key, value] of entriesOf(entry)) {
        this.add("shortNames", key);
        this.add("animationControllers", asString(value));
      }
    }
    namesOf(get(description.get("scripts"), "animate")).forEach((name) => this.add("shortNames", name));
    namesOf(description.get("render_controllers")).forEach((id) => this.add("renderControllers", id));
  }

  scanGeometry(json) {
    const geometries = [];
    for (const geometry of isArray(get(json, "minecraft:geometry")) ? json.get("minecraft:geometry") : []) {
      if (isObject(geometry)) {
        this.addParts("geometry", asString(get(geometry.get("description"), "identifier")));
        geometries.push(geometry);
      }
    }
    for (const [key, geometry] of entriesOf(json)) {
      if (key.startsWith("geometry.")) {
        this.addParts("geometry", key);
        geometries.push(geometry);
      }
    }
    for (const geometry of geometries) {
      for (const bone of isArray(get(geometry, "bones")) ? geometry.get("bones") : []) {
        this.add("boneNames", asString(get(bone, "name")));
        this.add("boneNames", asString(get(bone, "parent")));
        entriesOf(get(bone, "locators")).forEach(([locator]) => this.add("locators", locator));
        for (const mesh of isArray(get(bone, "texture_meshes")) ? bone.get("texture_meshes") : []) {
          this.add("shortNames", asString(get(mesh, "texture")));
        }
      }
    }
  }

  scanEffectEvents(timeline) {
    for (const [, value] of entriesOf(timeline)) {
      for (const event of isArray(value) ? value : [value]) {
        this.add("shortNames", asString(get(event, "effect")));
        this.add("locators", asString(get(event, "locator")));
      }
    }
  }

  scanAnimations(json) {
    for (const [id, animation] of entriesOf(get(json, "animations"))) {
      this.add("animations", id);
      entriesOf(get(animation, "bones")).forEach(([bone]) => this.add("boneNames", bone));
      this.scanEffectEvents(get(animation, "sound_effects"));
      this.scanEffectEvents(get(animation, "particle_effects"));
    }
  }

  scanAnimationControllers(json) {
    for (const [id, controller] of entriesOf(get(json, "animation_controllers"))) {
      this.add("animationControllers", id);
      for (const [, state] of entriesOf(get(controller, "states"))) {
        namesOf(get(state, "animations")).forEach((name) => this.add("shortNames", name));
        for (const key of ["particle_effects", "sound_effects"]) {
          for (const effect of isArray(get(state, key)) ? state.get(key) : []) {
            this.add("shortNames", asString(get(effect, "effect")));
            this.add("locators", asString(get(effect, "locator")));
          }
        }
      }
    }
  }

  scanRenderControllers(json) {
    for (const [id, controller] of entriesOf(get(json, "render_controllers"))) {
      this.add("renderControllers", id);
      forEachString(controller, (text) => {
        for (const match of text.matchAll(RC_REF)) {
          this.add("shortNames", match[2]);
        }
      });
      for (const key of ["materials", "part_visibility"]) {
        for (const entry of isArray(get(controller, key)) ? controller.get(key) : []) {
          for (const [bone] of entriesOf(entry)) {
            if (!bone.includes("*")) {
              this.add("boneNames", bone);
            }
          }
        }
      }
    }
  }

  scanParticle(json) {
    const description = get(get(json, "particle_effect"), "description");
    this.add("particles", asString(get(description, "identifier")));
    this.addParts("materials", asString(get(get(description, "basic_render_parameters"), "material")));
  }
}

async function readManifest(pack) {
  try {
    const manifest = parseJson(await readFile(join(pack, "manifest.json")));
    const header = get(manifest, "header");
    const version = get(header, "version");
    return {
      folder: basename(pack),
      name: asString(get(header, "name")) ?? basename(pack),
      version: isArray(version) ? version.map(String).join(".") : asString(version),
    };
  } catch {
    return { folder: basename(pack), name: basename(pack), version: null };
  }
}

function newestVanillaVersion(packs) {
  const versions = packs.filter((pack) => pack.folder.startsWith("vanilla") && pack.version).map((pack) => pack.version);
  const parts = (version) => version.split(".").map(Number);
  versions.sort((a, b) => {
    const left = parts(a);
    const right = parts(b);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const difference = (left[i] ?? 0) - (right[i] ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }
    return 0;
  });
  return versions.at(-1) ?? null;
}

export async function scanPacks(folder, options = {}) {
  const packs = await findPacks(folder);
  if (packs.length === 0) {
    throw new Error(`No packs found in ${folder}: expected a manifest.json there or in its subfolders`);
  }
  const set = new ExclusionSet();
  const scanner = new Scanner(set);
  const scanned = [];
  for (const pack of packs) {
    scanner.scanFiles(await loadPackFiles(pack));
    scanned.push(await readManifest(pack));
    options.onPack?.(scanned.at(-1));
  }
  set.meta = {
    name: options.name ?? basename(folder),
    source: folder,
    gameVersion: newestVanillaVersion(scanned),
    packs: scanned.map((pack) => `${pack.name}${pack.version ? " " + pack.version : ""}`),
    createdAt: new Date().toISOString(),
  };
  set.refreshDerived();
  return set;
}
