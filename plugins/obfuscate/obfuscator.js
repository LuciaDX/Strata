import { parseJson, stringifyJson, isObject, isArray, isPrimitive, asString } from "@strata/core";
import { createHasher } from "./hash.js";
import { JavaRandom, javaSplit, javaStringHash } from "./java.js";
import { extensionOf } from "@strata/nodes";
import { shuffleUi } from "./shuffle.js";

const RC_REF = /\b(Array|Geometry|Texture|Material)\.([A-Za-z0-9_]+)/gi;
const FIXED_PATH_PREFIXES = ["font/", "texts/", "materials/", "scripts/"];
const TEXTURE_LISTS = new Set(["textures/textures_list.json", "textures/texture_list.json"]);
const TRASH_DIRS = ["\u0081", "\u0082", "\u0083", "\u0084", "\u0085", "\u0086", "\u0087", "\u0088", "\u0089", "\u008a", "\u008b", "\u008c"];

export class Obfuscator {
  constructor(exclusions, hashKey, options = {}) {
    this.exclusions = exclusions;
    this.oStr = createHasher(hashKey, options.hash);
    this.rules = options.rules ?? null;
    this.trash = options.trash ?? null;
    this.shuffleUi = Boolean(options.shuffleUi);
    this.warn = options.warn ?? (() => {});
    this.mappings = new Map();
    this.uiNamespaces = new Set();
    this.uiElements = new Set();
    this.uiControls = new Set();
    this.customEntities = new Set();
    this.customAttachables = new Set();
  }

  allows(kind, name) {
    if (this.rules === null) {
      return true;
    }
    const keep = this.rules.get(kind);
    return keep !== undefined && !keep(name);
  }

  allowsPath(path) {
    const dot = path.lastIndexOf(".");
    const bare = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
    return this.allows("paths", path) && this.allows("paths", bare);
  }

  oName(kind, name) {
    return this.allows(kind, name) ? this.oStr(name) : name;
  }

  record(category, original, obfuscated) {
    if (original === obfuscated) {
      return;
    }
    let group = this.mappings.get(category);
    if (!group) {
      group = new Map();
      this.mappings.set(category, group);
    }
    group.set(original, obfuscated);
  }

  getMappings() {
    const result = {};
    for (const [category, group] of this.mappings) {
      result[category] = Object.fromEntries(group);
    }
    return result;
  }

  obfuscate(path, data) {
    if (path.startsWith("texts/") && path.endsWith(".lang")) {
      return this.obfuscateLang(data);
    }
    if (!path.endsWith(".json") && !path.endsWith(".material")) {
      return data;
    }
    const prefix = path.includes("/") ? path.split("/")[0] : "";

    let json;
    try {
      json = parseJson(data);
    } catch (error) {
      this.warn(`Could not parse ${path}, left unobfuscated: ${error.message}`);
      return data;
    }

    if (path === "textures/flipbook_textures.json" && isArray(json)) {
      return Buffer.from(stringifyJson(this.obfuscateFlipbooks(json)), "utf8");
    }
    if (TEXTURE_LISTS.has(path) && isArray(json)) {
      return Buffer.from(stringifyJson(this.obfuscateTextureList(json)), "utf8");
    }
    if (!isObject(json)) {
      return data;
    }

    if (path === "blocks.json") {
      json = this.obfuscateBlocks(json);
    } else if (path === "biomes_client.json") {
      this.rewriteFogReferences(json);
    } else if (path === "sounds.json") {
      json = this.obfuscateSoundEvents(json);
    } else if (path === "sounds/music_definitions.json") {
      json = this.obfuscateMusicDefinitions(json);
    }

    switch (prefix) {
      case "ui":
        json = this.obfuscateUi(json, path);
        break;
      case "animations":
        json = this.obfuscateAnimations(json);
        break;
      case "animation_controllers":
        json = this.obfuscateAnimationControllers(json);
        break;
      case "models":
        json = this.obfuscateGeometry(json);
        break;
      case "materials":
        json = this.obfuscateMaterials(json);
        break;
      case "particles":
        json = this.obfuscateParticle(json);
        break;
      case "render_controllers":
        json = this.obfuscateRenderControllers(json);
        break;
      case "sounds":
        if (path === "sounds/sound_definitions.json") {
          json = this.obfuscateSoundDefinitions(json);
        }
        break;
      case "textures":
        if (path === "textures/item_texture.json") {
          json = this.obfuscateItemTexture(json);
        } else if (path === "textures/terrain_texture.json") {
          json = this.obfuscateTerrainTexture(json);
        } else if (path.endsWith(".texture_set.json")) {
          json = this.obfuscateTextureSet(json, path);
        }
        break;
      case "entity":
      case "attachables":
        json = this.obfuscateClientEntity(json);
        break;
      case "block_culling":
        json = this.obfuscateBlockCulling(json);
        break;
      case "items":
        json = this.obfuscateItem(json);
        break;
      case "fogs":
        json = this.obfuscateFog(json);
        break;
      case "biomes":
        this.rewriteFogReferences(json);
        this.rewriteAmbientSounds(json);
        break;
    }

    return Buffer.from(stringifyJson(json), "utf8");
  }

  obfuscateAnimations(json) {
    const original = json.get("animations");
    if (!isObject(original)) {
      return json;
    }
    const replaced = new Map();
    for (const [animId, value] of original) {
      const newId = this.exclusions.isAnimation(animId) ? animId : this.obfuscateAnimId(animId);
      this.record("animations", animId, newId);
      let animData = value;
      if (isObject(animData)) {
        animData = this.obfuscateAnimBones(animData);
        if (isObject(animData.get("sound_effects"))) {
          animData.set("sound_effects", this.obfuscateAnimSoundEffects(animData.get("sound_effects")));
        }
        if (isObject(animData.get("particle_effects"))) {
          animData.set("particle_effects", this.obfuscateAnimParticleEffects(animData.get("particle_effects")));
        }
      }
      replaced.set(newId, animData);
    }
    json.set("animations", replaced);
    return json;
  }

  obfuscateAnimBones(anim) {
    const bones = anim.get("bones");
    if (!isObject(bones)) {
      return anim;
    }
    const newBones = new Map();
    for (const [name, value] of bones) {
      newBones.set(this.obfuscateBoneName(name), value);
    }
    anim.set("bones", newBones);
    return anim;
  }

  obfuscateAnimSoundEffects(effects) {
    const result = new Map();
    for (const [time, value] of effects) {
      result.set(time, this.mapAnimEvents(value, (event) => {
        this.rewriteString(event, "effect", (effect) => this.oShort(effect));
      }));
    }
    return result;
  }

  obfuscateAnimParticleEffects(effects) {
    const result = new Map();
    for (const [time, value] of effects) {
      result.set(time, this.mapAnimEvents(value, (event) => {
        this.rewriteString(event, "effect", (effect) => this.oShort(effect));
        this.rewriteString(event, "locator", (locator) => this.oLocator(locator));
      }));
    }
    return result;
  }

  mapAnimEvents(value, transform) {
    if (isObject(value)) {
      transform(value);
      return value;
    }
    if (isArray(value)) {
      return value.map((event) => {
        if (isObject(event)) {
          transform(event);
        }
        return event;
      });
    }
    return value;
  }

  rewriteString(object, key, transform) {
    if (!object.has(key)) {
      return;
    }
    const value = asString(object.get(key));
    if (value !== null) {
      object.set(key, transform(value));
    }
  }

  obfuscateAnimId(id) {
    if (!this.allows("animations", id)) {
      return id;
    }
    if (id.startsWith("animation.")) {
      return "animation." + this.oStr(id.slice("animation.".length));
    }
    return this.oBareAnim(id);
  }

  oBareAnim(id) {
    return this.allows("animations", id) && this.allows("controllers", id) ? this.oStr(id) : id;
  }

  oState(name) {
    return this.oName("controllers", name);
  }

  obfuscateAnimationControllers(json) {
    const original = json.get("animation_controllers");
    if (!isObject(original)) {
      return json;
    }
    const replaced = new Map();
    for (const [controllerId, value] of original) {
      const newId = this.exclusions.isAnimationController(controllerId) ? controllerId : this.obfuscateControllerAnimId(controllerId);
      this.record("animationControllers", controllerId, newId);
      const controller = isObject(value) ? value : new Map();
      this.rewriteString(controller, "initial_state", (state) => this.oState(state));
      if (isObject(controller.get("states"))) {
        controller.set("states", this.obfuscateControllerStates(controller.get("states")));
      }
      replaced.set(newId, controller);
    }
    json.set("animation_controllers", replaced);
    return json;
  }

  obfuscateControllerStates(states) {
    const result = new Map();
    for (const [name, value] of states) {
      const state = isObject(value) ? value : new Map();
      if (isArray(state.get("animations"))) {
        state.set("animations", this.obfuscateControllerAnimRefs(state.get("animations")));
      }
      if (isArray(state.get("transitions"))) {
        state.set("transitions", this.obfuscateControllerTransitions(state.get("transitions")));
      }
      if (isArray(state.get("particle_effects"))) {
        state.set("particle_effects", this.obfuscateParticleEffects(state.get("particle_effects")));
      }
      if (isArray(state.get("sound_effects"))) {
        state.set("sound_effects", this.obfuscateSoundEffects(state.get("sound_effects")));
      }
      result.set(this.oState(name), state);
    }
    return result;
  }

  obfuscateControllerAnimRefs(animations) {
    return animations.map((entry) => {
      if (isPrimitive(entry)) {
        return this.oShort(asString(entry));
      }
      if (isObject(entry)) {
        return this.renameKeys(entry, (key) => this.oShort(key));
      }
      return entry;
    });
  }

  obfuscateControllerTransitions(transitions) {
    return transitions.map((entry) => (isObject(entry) ? this.renameKeys(entry, (key) => this.oState(key)) : entry));
  }

  obfuscateParticleEffects(particles) {
    return particles.map((entry) => {
      if (isObject(entry)) {
        this.rewriteString(entry, "effect", (effect) => this.oShort(effect));
        this.rewriteString(entry, "locator", (locator) => this.oLocator(locator));
      }
      return entry;
    });
  }

  obfuscateSoundEffects(sounds) {
    return sounds.map((entry) => {
      if (isObject(entry)) {
        this.rewriteString(entry, "effect", (effect) => this.oShort(effect));
      }
      return entry;
    });
  }

  renameKeys(object, rename) {
    const result = new Map();
    for (const [key, value] of object) {
      result.set(rename(key), value);
    }
    return result;
  }

  obfuscateControllerAnimId(id) {
    if (!this.allows("controllers", id)) {
      return id;
    }
    if (id.startsWith("controller.animation.")) {
      return "controller.animation." + this.oStr(id.slice("controller.animation.".length));
    }
    return this.oBareAnim(id);
  }

  obfuscateGeometry(json) {
    if (json.has("minecraft:geometry")) {
      const geometries = json.get("minecraft:geometry");
      if (!isArray(geometries)) {
        return json;
      }
      for (const geo of geometries) {
        if (!isObject(geo)) {
          continue;
        }
        const description = geo.get("description");
        if (isObject(description) && description.has("identifier")) {
          const originalId = asString(description.get("identifier"));
          if (originalId !== null) {
            const newGeoId = this.obfuscateGeoId(originalId);
            description.set("identifier", newGeoId);
            this.record("geometry", originalId, newGeoId);
          }
        }
        if (isArray(geo.get("bones"))) {
          geo.set("bones", this.obfuscateGeoBones(geo.get("bones")));
        }
      }
      return json;
    }

    const result = new Map();
    for (const [key, value] of json) {
      if (!key.startsWith("geometry.")) {
        result.set(key, value);
        continue;
      }
      const newKey = this.obfuscateGeoId(key);
      this.record("geometry", key, newKey);
      const geo = isObject(value) ? value : new Map();
      if (isArray(geo.get("bones"))) {
        geo.set("bones", this.obfuscateGeoBones(geo.get("bones")));
      }
      result.set(newKey, geo);
    }
    return result;
  }

  obfuscateGeoBones(bones) {
    return bones.map((bone) => {
      if (!isObject(bone)) {
        return bone;
      }
      this.rewriteString(bone, "name", (name) => this.obfuscateBoneName(name));
      this.rewriteString(bone, "parent", (name) => this.obfuscateBoneName(name));
      if (isObject(bone.get("locators"))) {
        bone.set("locators", this.renameKeys(bone.get("locators"), (key) => this.oLocator(key)));
      }
      if (isArray(bone.get("texture_meshes"))) {
        for (const mesh of bone.get("texture_meshes")) {
          if (isObject(mesh)) {
            this.rewriteString(mesh, "texture", (texture) => this.oShort(texture));
          }
        }
      }
      return bone;
    });
  }

  obfuscateMaterials(json) {
    const original = json.get("materials");
    if (!isObject(original)) {
      return json;
    }
    json.set("materials", this.renameKeys(original, (key) => (key === "version" ? key : this.obfuscateMaterialId(key))));
    return json;
  }

  obfuscateParticle(json) {
    const effect = json.get("particle_effect");
    if (!isObject(effect)) {
      return json;
    }
    const description = effect.get("description");
    if (!isObject(description)) {
      return json;
    }

    const id = description.has("identifier") ? asString(description.get("identifier")) : null;
    if (id !== null && !this.exclusions.isParticle(id) && this.allows("particles", id)) {
      const newParticleId = this.obfuscateNamespacedId(id);
      description.set("identifier", newParticleId);
      this.record("particles", id, newParticleId);
    }

    const params = description.get("basic_render_parameters");
    if (isObject(params)) {
      this.rewriteString(params, "material", (material) => (this.exclusions.isMaterial(material) ? material : this.oName("materials", material)));
      this.rewriteString(params, "texture", (texture) => this.obfuscatePath(texture));
    }

    if (isObject(effect.get("events"))) {
      this.rewriteParticleEvents(effect.get("events"));
    }
    return json;
  }

  obfuscateParticleId(id) {
    return this.exclusions.isParticle(id) || !this.allows("particles", id) ? id : this.obfuscateNamespacedId(id);
  }

  rewriteParticleEvents(value) {
    if (isArray(value)) {
      value.forEach((entry) => this.rewriteParticleEvents(entry));
      return;
    }
    if (!isObject(value)) {
      return;
    }
    for (const [key, entry] of value) {
      if (key === "particle_effect" && isObject(entry)) {
        this.rewriteString(entry, "effect", (id) => this.obfuscateParticleId(id));
      } else if (key === "sound_effect" && isObject(entry)) {
        this.rewriteString(entry, "event_name", (name) => this.obfuscateSoundName(name));
      } else {
        this.rewriteParticleEvents(entry);
      }
    }
  }

  obfuscateMaterialId(id) {
    const colon = id.indexOf(":");
    const name = colon !== -1 ? id.slice(0, colon) : id;
    const obfuscated = this.exclusions.isMaterial(name) ? name : this.oName("materials", name);
    return colon !== -1 ? obfuscated + ":" + this.obfuscateMaterialId(id.slice(colon + 1)) : obfuscated;
  }

  obfuscateGeoId(id) {
    const colon = id.indexOf(":");
    const name = colon !== -1 ? id.slice(0, colon) : id;
    let obfuscated;
    if (this.exclusions.isGeometry(name) || !this.allows("geometry", name)) {
      obfuscated = name;
    } else if (name.startsWith("geometry.")) {
      obfuscated = "geometry." + this.oStr(name.slice("geometry.".length));
    } else {
      obfuscated = this.oStr(name);
    }
    return colon !== -1 ? obfuscated + ":" + this.obfuscateGeoId(id.slice(colon + 1)) : obfuscated;
  }

  obfuscateRenderControllers(json) {
    const original = json.get("render_controllers");
    if (!isObject(original)) {
      return json;
    }
    const replaced = new Map();
    for (const [id, value] of original) {
      const newId = this.exclusions.isRenderController(id) ? id : this.obfuscateRcId(id);
      const rc = isObject(value) ? value : new Map();
      if (isObject(rc.get("arrays"))) {
        rc.set("arrays", this.obfuscateRcArrays(rc.get("arrays")));
      }
      if (isPrimitive(rc.get("geometry"))) {
        rc.set("geometry", this.obfuscateRcRef(asString(rc.get("geometry"))));
      }
      if (isArray(rc.get("textures"))) {
        rc.set("textures", this.obfuscateRcRefArray(rc.get("textures")));
      }
      if (isArray(rc.get("materials"))) {
        rc.set("materials", this.obfuscateRcBoneArray(rc.get("materials"), true));
      }
      if (isArray(rc.get("part_visibility"))) {
        rc.set("part_visibility", this.obfuscateRcBoneArray(rc.get("part_visibility"), false));
      }
      replaced.set(newId, rc);
    }
    json.set("render_controllers", replaced);
    return json;
  }

  obfuscateRcArrays(arrays) {
    const result = new Map();
    for (const [type, value] of arrays) {
      if (!isObject(value)) {
        result.set(type, value);
        continue;
      }
      const group = new Map();
      for (const [name, entries] of value) {
        group.set(this.obfuscateRcRef(name), isArray(entries) ? this.obfuscateRcRefArray(entries) : entries);
      }
      result.set(type, group);
    }
    return result;
  }

  obfuscateRcRefArray(array) {
    return array.map((entry) => (isPrimitive(entry) ? this.obfuscateRcRef(asString(entry)) : entry));
  }

  obfuscateRcBoneArray(array, obfuscateValues) {
    return array.map((entry) => {
      if (!isObject(entry)) {
        return entry;
      }
      const result = new Map();
      for (const [key, value] of entry) {
        const newValue = obfuscateValues && typeof value === "string" ? this.obfuscateRcRef(value) : value;
        result.set(this.obfuscateRcBoneKey(key), newValue);
      }
      return result;
    });
  }

  obfuscateRcRef(value) {
    return value.replace(RC_REF, (match, kind, name) => kind + "." + (kind.toLowerCase() === "array" ? this.oName("renderControllers", name) : this.oShort(name)));
  }

  obfuscateRcBoneKey(key) {
    return key.includes("*") ? key : this.obfuscateBoneName(key);
  }

  obfuscateRcId(id) {
    if (!this.allows("renderControllers", id)) {
      return id;
    }
    if (id.startsWith("controller.render.")) {
      return "controller.render." + this.oStr(id.slice("controller.render.".length));
    }
    return this.oStr(id);
  }

  obfuscateItemTexture(json) {
    return this.obfuscateAtlas(json, "itemTextures", (key) => this.obfuscateItemTextureKey(key));
  }

  obfuscateTerrainTexture(json) {
    return this.obfuscateAtlas(json, "terrainTextures", (key) => this.obfuscateTerrainKey(key));
  }

  obfuscateAtlas(json, category, renameKey) {
    const data = json.get("texture_data");
    if (!isObject(data)) {
      return json;
    }
    const replaced = new Map();
    for (const [key, value] of data) {
      if (isObject(value) && value.has("textures")) {
        value.set("textures", this.obfuscateTextureValue(value.get("textures")));
      }
      const newKey = renameKey(key);
      this.record(category, key, newKey);
      replaced.set(newKey, value);
    }
    json.set("texture_data", replaced);
    return json;
  }

  obfuscateItemTextureKey(key) {
    return this.exclusions.isItemTexture(key) ? key : this.oName("itemTextures", key);
  }

  obfuscateTerrainKey(key) {
    return this.exclusions.isTerrainTexture(key) ? key : this.oName("terrainTextures", key);
  }

  obfuscateBlocks(json) {
    for (const definition of json.values()) {
      if (!isObject(definition)) {
        continue;
      }
      for (const key of ["textures", "carried_textures"]) {
        const textures = definition.get(key);
        if (isPrimitive(textures)) {
          definition.set(key, this.obfuscateTerrainKey(asString(textures)));
        } else if (isObject(textures)) {
          for (const [face, value] of textures) {
            if (isPrimitive(value)) {
              textures.set(face, this.obfuscateTerrainKey(asString(value)));
            }
          }
        }
      }
    }
    return json;
  }

  obfuscateItem(json) {
    const item = json.get("minecraft:item");
    const components = isObject(item) ? item.get("components") : null;
    if (!isObject(components)) {
      return json;
    }
    const icon = components.get("minecraft:icon");
    if (isPrimitive(icon)) {
      components.set("minecraft:icon", this.obfuscateItemTextureKey(asString(icon)));
    } else if (isObject(icon)) {
      this.rewriteString(icon, "texture", (key) => this.obfuscateItemTextureKey(key));
    }
    return json;
  }

  obfuscateFogId(id) {
    if (id.startsWith("minecraft:") || !this.allows("fogs", id)) {
      return id;
    }
    const newId = this.obfuscateNamespacedId(id);
    this.record("fogs", id, newId);
    return newId;
  }

  obfuscateFog(json) {
    const settings = json.get("minecraft:fog_settings");
    const description = isObject(settings) ? settings.get("description") : null;
    if (isObject(description)) {
      this.rewriteString(description, "identifier", (id) => this.obfuscateFogId(id));
    }
    return json;
  }

  rewriteFogReferences(value) {
    if (isArray(value)) {
      value.forEach((entry) => this.rewriteFogReferences(entry));
    } else if (isObject(value)) {
      for (const [key, entry] of value) {
        if (key === "fog_identifier" && typeof entry === "string") {
          value.set(key, this.obfuscateFogId(entry));
        } else {
          this.rewriteFogReferences(entry);
        }
      }
    }
  }

  rewriteAmbientSounds(json) {
    const biome = json.get("minecraft:client_biome");
    const components = isObject(biome) ? biome.get("components") : null;
    const ambient = isObject(components) ? components.get("minecraft:ambient_sounds") : null;
    if (!isObject(ambient)) {
      return;
    }
    for (const [key, value] of ambient) {
      if (typeof value === "string") {
        ambient.set(key, this.obfuscateSoundName(value));
      } else if (isObject(value)) {
        this.rewriteString(value, "asset", (name) => this.obfuscateSoundName(name));
      }
    }
  }

  obfuscateBlockCulling(json) {
    const root = json.get("minecraft:block_culling_rules");
    if (!isObject(root)) {
      return json;
    }
    const description = root.get("description");
    if (isObject(description)) {
      this.rewriteString(description, "identifier", (id) => {
        if (id.startsWith("minecraft:") || !this.allows("culling", id)) {
          return id;
        }
        const newId = this.obfuscateNamespacedId(id);
        this.record("cullingRules", id, newId);
        return newId;
      });
    }
    if (isArray(root.get("rules"))) {
      for (const rule of root.get("rules")) {
        const part = isObject(rule) ? rule.get("geometry_part") : null;
        if (isObject(part)) {
          this.rewriteString(part, "bone", (bone) => this.obfuscateBoneName(bone));
        }
      }
    }
    return json;
  }

  obfuscateFlipbooks(flipbooks) {
    for (const flipbook of flipbooks) {
      if (!isObject(flipbook)) {
        continue;
      }
      this.rewriteString(flipbook, "flipbook_texture", (texture) => this.obfuscatePath(texture));
      this.rewriteString(flipbook, "atlas_tile", (tile) => this.obfuscateTerrainKey(tile));
    }
    return flipbooks;
  }

  prepare(files) {
    for (const [path, data] of files) {
      if ((path.startsWith("entity/") || path.startsWith("attachables/")) && path.endsWith(".json")) {
        this.collectIdentifier(data);
        continue;
      }
      if (!path.startsWith("ui/") || !path.endsWith(".json")) {
        continue;
      }
      let json;
      try {
        json = parseJson(data);
      } catch {
        continue;
      }
      if (!isObject(json) || typeof json.get("namespace") !== "string") {
        continue;
      }
      const namespace = json.get("namespace");
      if (!this.allows("ui", namespace)) {
        continue;
      }
      if (!this.exclusions.isUiNamespace(namespace)) {
        this.uiNamespaces.add(namespace);
      }
      for (const key of json.keys()) {
        if (key === "namespace") {
          continue;
        }
        const name = key.split("@")[0];
        if (!this.exclusions.isUiElement(namespace, name) && this.allows("ui", name)) {
          this.uiElements.add(namespace + "." + name);
        }
        this.collectUiControls(json.get(key), key);
      }
    }
  }

  collectIdentifier(data) {
    let json;
    try {
      json = parseJson(data);
    } catch {
      return;
    }
    if (!isObject(json)) {
      return;
    }
    for (const [rootKey, isAttachable] of [["minecraft:client_entity", false], ["minecraft:attachable", true]]) {
      const root = json.get(rootKey);
      const description = isObject(root) ? root.get("description") : null;
      const id = isObject(description) ? asString(description.get("identifier")) : null;
      if (id === null || !this.allows("entities", id)) {
        continue;
      }
      if (isAttachable && !this.exclusions.isAttachable(id)) {
        this.customAttachables.add(id);
      } else if (!isAttachable && !this.exclusions.isEntity(id)) {
        this.customEntities.add(id);
      }
    }
  }

  obfuscateLangKey(key) {
    for (const [prefix, ids] of [["item.spawn_egg.entity.", this.customEntities], ["entity.", this.customEntities], ["item.", this.customAttachables]]) {
      if (key.startsWith(prefix) && key.endsWith(".name")) {
        const id = key.slice(prefix.length, -".name".length);
        if (ids.has(id)) {
          return prefix + this.obfuscateNamespacedId(id) + ".name";
        }
      }
    }
    return key;
  }

  obfuscateLang(data) {
    const text = Buffer.from(data).toString("utf8");
    let changed = false;
    const lines = text.split("\n").map((line) => {
      const equals = line.indexOf("=");
      if (equals <= 0 || line.startsWith("#")) {
        return line;
      }
      const key = line.slice(0, equals);
      const newKey = this.obfuscateLangKey(key);
      if (newKey === key) {
        return line;
      }
      changed = true;
      return newKey + line.slice(equals);
    });
    return changed ? Buffer.from(lines.join("\n"), "utf8") : data;
  }

  holdsUiControls(parentKey) {
    return parentKey === "controls" || parentKey === "value" || (typeof parentKey === "string" && parentKey.startsWith("$"));
  }

  collectUiControls(value, parentKey) {
    if (isArray(value)) {
      const holds = this.holdsUiControls(parentKey);
      for (const entry of value) {
        if (holds && isObject(entry)) {
          for (const [key, control] of entry) {
            const name = key.split("@")[0];
            if (isObject(control) && name !== "" && !name.startsWith("$") && this.allows("ui", name)) {
              this.uiControls.add(name);
            }
          }
        }
        this.collectUiControls(entry, parentKey);
      }
    } else if (isObject(value)) {
      for (const [key, entry] of value) {
        this.collectUiControls(entry, key);
      }
    }
  }

  uiControlName(name) {
    return this.uiControls.has(name) ? this.oStr(name) : name;
  }

  isCustomUiElement(namespace, name) {
    return this.uiNamespaces.has(namespace) || this.uiElements.has(namespace + "." + name);
  }

  uiNamespaceName(namespace) {
    return this.uiNamespaces.has(namespace) ? this.oStr(namespace) : namespace;
  }

  resolveUiReference(reference, namespace, bareIsLocal) {
    const prefix = reference.startsWith("@") ? "@" : "";
    const body = reference.slice(prefix.length);
    const dot = body.indexOf(".");
    if (dot === -1) {
      if ((prefix || bareIsLocal) && namespace !== null && this.isCustomUiElement(namespace, body)) {
        return prefix + this.oStr(body);
      }
      return reference;
    }
    const target = body.slice(0, dot);
    const name = body.slice(dot + 1);
    if (!this.isCustomUiElement(target, name)) {
      return reference;
    }
    return prefix + this.uiNamespaceName(target) + "." + this.oStr(name);
  }

  obfuscateUiKey(key, namespace, isDefinition, isControl) {
    const at = key.indexOf("@");
    const name = at === -1 ? key : key.slice(0, at);
    let newName = name;
    if (isDefinition && this.isCustomUiElement(namespace, name)) {
      newName = this.oStr(name);
    } else if (isControl) {
      newName = this.uiControlName(name);
    }
    if (at === -1) {
      return newName;
    }
    return newName + "@" + this.resolveUiReference(key.slice(at + 1), namespace, true);
  }

  obfuscateUi(json, path) {
    const namespace = typeof json.get("namespace") === "string" ? json.get("namespace") : null;
    const result = new Map();
    for (const [key, value] of json) {
      if (key === "namespace" && namespace !== null) {
        result.set(key, this.uiNamespaceName(namespace));
        continue;
      }
      const newKey = namespace !== null ? this.obfuscateUiKey(key, namespace, true, false) : key;
      result.set(newKey, this.obfuscateUiValue(value, namespace, key));
    }
    if (path === "ui/_ui_defs.json" && isArray(result.get("ui_defs"))) {
      result.set("ui_defs", result.get("ui_defs").map((entry) => (isPrimitive(entry) ? this.obfuscatePath(asString(entry)) : entry)));
    }
    return this.shuffleUi ? shuffleUi(result, this.oStr(`shuffle:${path}`)) : result;
  }

  obfuscateUiValue(value, namespace, parentKey, inControlArray = false) {
    if (typeof value === "string") {
      if (parentKey === "sound_name") {
        return this.obfuscateSoundName(value);
      }
      if (value.startsWith("textures/")) {
        return this.obfuscatePath(value);
      }
      if (parentKey === "text") {
        return value;
      }
      if (parentKey === "source_control_name") {
        return this.uiControlName(value);
      }
      if (parentKey === "control_name" && !value.startsWith("@") && !value.includes(".")) {
        return this.uiControlName(value);
      }
      const at = value.indexOf("@");
      if (at > 0) {
        return this.uiControlName(value.slice(0, at)) + "@" + this.resolveUiReference(value.slice(at + 1), namespace, true);
      }
      return this.resolveUiReference(value, namespace, false);
    }
    if (isArray(value)) {
      const holds = this.holdsUiControls(parentKey);
      return value.map((entry) => this.obfuscateUiValue(entry, namespace, parentKey, holds));
    }
    if (isObject(value)) {
      const result = new Map();
      for (const [key, entry] of value) {
        const isControl = inControlArray && isObject(entry);
        result.set(this.obfuscateUiKey(key, namespace, false, isControl), this.obfuscateUiValue(entry, namespace, key));
      }
      return result;
    }
    return value;
  }

  obfuscateTextureValue(textures) {
    if (isArray(textures)) {
      return textures.map((entry) => this.obfuscateTextureEntry(entry));
    }
    return this.obfuscateTextureEntry(textures);
  }

  obfuscateTextureEntry(entry) {
    if (isPrimitive(entry)) {
      return this.obfuscatePath(asString(entry));
    }
    if (isObject(entry)) {
      this.rewriteString(entry, "path", (path) => this.obfuscatePath(path));
      if (isArray(entry.get("variations"))) {
        for (const variation of entry.get("variations")) {
          if (isObject(variation)) {
            this.rewriteString(variation, "path", (path) => this.obfuscatePath(path));
          }
        }
      }
    }
    return entry;
  }

  obfuscateTextureList(list) {
    return list.map((entry) => (isPrimitive(entry) ? this.obfuscatePath(asString(entry)) : entry));
  }

  obfuscateTextureSet(json, path) {
    const set = json.get("minecraft:texture_set");
    if (!isObject(set)) {
      return json;
    }
    const folder = path.slice(0, path.lastIndexOf("/") + 1);
    for (const [key, value] of set) {
      if (typeof value !== "string" || value.startsWith("#")) {
        continue;
      }
      if (!this.exclusions.isPathNoExt(folder + value) && this.allowsPath(folder + value)) {
        set.set(key, this.oStr(value));
      }
    }
    return json;
  }

  obfuscateSoundDefinitions(json) {
    if (json.has("sound_definitions")) {
      const definitions = json.get("sound_definitions");
      if (!isObject(definitions)) {
        return json;
      }
      const replaced = new Map();
      for (const [name, value] of definitions) {
        const newName = this.obfuscateSoundName(name);
        this.record("sounds", name, newName);
        replaced.set(newName, isObject(value) ? this.obfuscateSoundDefEntry(value) : value);
      }
      json.set("sound_definitions", replaced);
      return json;
    }

    const replaced = new Map();
    for (const [key, value] of json) {
      const isVersion = key === "format_version";
      const newKey = isVersion ? key : this.obfuscateSoundName(key);
      this.record("sounds", key, newKey);
      replaced.set(newKey, !isVersion && isObject(value) ? this.obfuscateSoundDefEntry(value) : value);
    }
    return replaced;
  }

  obfuscateSoundName(name) {
    return this.exclusions.isSound(name) ? name : this.oName("sounds", name);
  }

  obfuscateSoundEntityKey(id) {
    if (!id.includes(":") || this.exclusions.isEntity(id) || !this.allows("entities", id)) {
      return id;
    }
    return this.obfuscateNamespacedId(id);
  }

  obfuscateSoundEvents(json) {
    for (const [section, value] of json) {
      if (!isObject(value)) {
        continue;
      }
      if (section === "interactive_sounds") {
        for (const [kind, groups] of value) {
          if (isObject(groups)) {
            value.set(kind, this.obfuscateSoundSection(groups));
          }
        }
      } else {
        if (section === "individual_event_sounds" && isObject(value.get("events"))) {
          value.set("events", this.renameKeys(value.get("events"), (name) => this.obfuscateSoundName(name)));
        }
        if (section === "individual_named_sounds" && isObject(value.get("sounds"))) {
          value.set("sounds", this.renameKeys(value.get("sounds"), (name) => this.obfuscateSoundName(name)));
        }
        json.set(section, this.obfuscateSoundSection(value));
      }
    }
    return json;
  }

  obfuscateSoundSection(section) {
    if (isObject(section.get("entities"))) {
      section.set("entities", this.renameKeys(section.get("entities"), (id) => this.obfuscateSoundEntityKey(id)));
    }
    this.rewriteSoundReferences(section);
    return section;
  }

  rewriteSoundReferences(value) {
    if (isArray(value)) {
      value.forEach((entry) => this.rewriteSoundReferences(entry));
      return;
    }
    if (!isObject(value)) {
      return;
    }
    for (const [key, entry] of value) {
      if ((key === "sound" || key === "sounds") && typeof entry === "string") {
        if (entry !== "") {
          value.set(key, this.obfuscateSoundName(entry));
        }
      } else if (key === "events" && isObject(entry)) {
        for (const [event, target] of entry) {
          if (typeof target === "string") {
            if (target !== "") {
              entry.set(event, this.obfuscateSoundName(target));
            }
          } else {
            this.rewriteSoundReferences(target);
          }
        }
      } else {
        this.rewriteSoundReferences(entry);
      }
    }
  }

  obfuscateMusicDefinitions(json) {
    for (const definition of json.values()) {
      if (isObject(definition)) {
        this.rewriteString(definition, "event_name", (name) => this.obfuscateSoundName(name));
      }
    }
    return json;
  }

  obfuscateSoundDefEntry(entry) {
    const sounds = entry.get("sounds");
    if (!isArray(sounds)) {
      return entry;
    }
    entry.set("sounds", sounds.map((sound) => {
      if (isPrimitive(sound)) {
        return this.obfuscatePath(asString(sound));
      }
      if (isObject(sound)) {
        this.rewriteString(sound, "name", (name) => this.obfuscatePath(name));
      }
      return sound;
    }));
    return entry;
  }

  obfuscateClientEntity(json) {
    const rootKey = json.has("minecraft:client_entity") ? "minecraft:client_entity" : json.has("minecraft:attachable") ? "minecraft:attachable" : null;
    if (rootKey === null || !isObject(json.get(rootKey))) {
      return json;
    }
    const description = json.get(rootKey).get("description");
    if (!isObject(description)) {
      return json;
    }

    const id = description.has("identifier") ? asString(description.get("identifier")) : null;
    if (id !== null) {
      const isVanilla = rootKey === "minecraft:attachable" ? this.exclusions.isAttachable(id) : this.exclusions.isEntity(id);
      if (!isVanilla && this.allows("entities", id)) {
        const newEntityId = this.obfuscateNamespacedId(id);
        description.set("identifier", newEntityId);
        this.record(rootKey === "minecraft:attachable" ? "attachables" : "entities", id, newEntityId);
      }
    }

    const animValue = (value) => this.obfuscateEntityAnimValue(value);
    this.rewriteEntityMap(description, "materials", (value) => this.obfuscateMaterialId(value));
    this.rewriteEntityMap(description, "particle_effects", (value) => this.obfuscateParticleId(value));
    this.rewriteEntityMap(description, "sound_effects", (value) => this.obfuscateSoundName(value));
    this.rewriteEntityMap(description, "textures", (value) => this.obfuscatePath(value));
    this.rewriteEntityMap(description, "geometry", (value) => this.obfuscateGeoId(value));
    this.rewriteEntityMap(description, "animations", animValue);

    if (isArray(description.get("animation_controllers"))) {
      description.set("animation_controllers", description.get("animation_controllers").map((entry) => (isObject(entry) ? this.obfuscateEntityMap(entry, animValue) : entry)));
    }

    this.rewriteEntityMap(description, "particle_emitters", animValue);

    const spawnEgg = description.get("spawn_egg");
    if (isObject(spawnEgg)) {
      this.rewriteString(spawnEgg, "texture", (texture) => this.obfuscateItemTextureKey(texture));
    }

    if (isArray(description.get("render_controllers"))) {
      description.set("render_controllers", this.obfuscateEntityRcList(description.get("render_controllers")));
    }

    const scripts = description.get("scripts");
    if (isObject(scripts) && isArray(scripts.get("animate"))) {
      scripts.set("animate", this.obfuscateEntityAnimateList(scripts.get("animate")));
    }

    return json;
  }

  rewriteEntityMap(description, key, transform) {
    if (isObject(description.get(key))) {
      description.set(key, this.obfuscateEntityMap(description.get(key), transform));
    }
  }

  obfuscateEntityMap(map, transform) {
    const result = new Map();
    for (const [key, value] of map) {
      result.set(this.oShort(key), isPrimitive(value) ? transform(asString(value)) : value);
    }
    return result;
  }

  obfuscateEntityAnimValue(id) {
    if (id.startsWith("controller.animation.")) {
      return this.exclusions.isAnimationController(id) ? id : this.obfuscateControllerAnimId(id);
    }
    if (id.startsWith("animation.")) {
      return this.exclusions.isAnimation(id) ? id : this.obfuscateAnimId(id);
    }
    if (this.exclusions.isAnimation(id) || this.exclusions.isAnimationController(id)) {
      return id;
    }
    return this.oBareAnim(id);
  }

  obfuscateEntityRcList(list) {
    const rename = (id) => (this.exclusions.isRenderController(id) ? id : this.obfuscateRcId(id));
    return list.map((entry) => {
      if (isPrimitive(entry)) {
        return rename(asString(entry));
      }
      if (isObject(entry)) {
        return this.renameKeys(entry, rename);
      }
      return entry;
    });
  }

  obfuscateEntityAnimateList(list) {
    return list.map((entry) => {
      if (isPrimitive(entry)) {
        return this.oShort(asString(entry));
      }
      if (isObject(entry)) {
        return this.renameKeys(entry, (key) => this.oShort(key));
      }
      return entry;
    });
  }

  oShort(name) {
    return this.exclusions.isShortName(name) ? name : this.oName("shortNames", name);
  }

  oLocator(name) {
    return this.exclusions.isLocator(name) ? name : this.oName("locators", name);
  }

  obfuscateBoneName(name) {
    return this.exclusions.isBone(name) ? name : this.oName("bones", name);
  }

  obfuscateNamespacedId(id) {
    const colon = id.indexOf(":");
    if (colon === -1) {
      return this.oStr(id);
    }
    const namespace = id.slice(0, colon);
    return (namespace === "minecraft" ? namespace : this.oStr(namespace)) + ":" + this.oStr(id.slice(colon + 1));
  }

  obfuscatePath(path) {
    if (this.exclusions.isPath(path) || this.exclusions.isPathNoExt(path) || !this.allowsPath(path)) {
      return path;
    }
    if (FIXED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return path;
    }

    const parts = javaSplit(path, "/");
    const prefixDepth = parts[0] === "models" ? 2 : 1;
    if (parts.length <= prefixDepth) {
      return path;
    }

    let result = parts.slice(0, prefixDepth).join("/");
    if (this.trash) {
      const lastSlash = path.lastIndexOf("/");
      result += "/" + this.buildTrashPrefix(lastSlash !== -1 ? path.slice(0, lastSlash) : path);
    }
    for (let i = prefixDepth; i < parts.length - 1; i++) {
      result += "/" + this.oStr(parts[i]);
    }
    return result + "/" + this.obfuscateFileName(parts[parts.length - 1]);
  }

  buildTrashPrefix(parentDir) {
    const random = new JavaRandom(javaStringHash(parentDir));
    const levels = this.trash.minDepth + random.nextInt(this.trash.maxDepth - this.trash.minDepth + 1);
    const segments = [];
    for (let i = 0; i < levels; i++) {
      segments.push(TRASH_DIRS[random.nextInt(TRASH_DIRS.length)]);
    }
    return segments.join("/");
  }

  obfuscateFileName(fileName) {
    if (fileName.endsWith(".texture_set.json")) {
      return this.oStr(fileName.slice(0, -".texture_set.json".length)) + ".texture_set.json";
    }
    const extension = extensionOf(fileName);
    if (extension === "") {
      return this.oStr(fileName);
    }
    const base = fileName.length - extension.length - 1;
    return this.oStr(fileName.slice(0, base)) + fileName.slice(base);
  }

}
