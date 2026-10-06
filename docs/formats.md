# Resource pack formats

How Strata treats every resource pack file type: what each one defines, what it references, what the obfuscator does with it, and what the scanner must record so references into packs we don't touch keep working.

## Scope

Strata only handles resource packs for custom (non-vanilla) dedicated servers. Behavior packs, BDS add-ons and Geyser are out of scope. The mappings file is the only contract with the server: the server swaps every original name it sends (packet strings, network NBT strings) for its hashed version. Anything the server can send must be in the mappings, and nothing that could collide with ordinary text should be.

## Exclusions

Everything the obfuscator leaves alone comes from exclusion sets connected to the Obfuscate node's `exclusions` input, which accepts any number of connections. Their contents are merged.

| Node | Output |
|---|---|
| Exclusion File | an exclusion file produced by the scanner: vanilla, or any pack the obfuscated pack has to keep working with |
| Keep Names | a list of names, ids and paths typed by hand; `*` is a wildcard (`geyser_custom:*`, `textures/ui/shared/*`, `fm_shop.*`) |
| Scan Packs | scans a pack folder, or a folder of packs, directly; can also save the result as an exclusion file |

A Keep Names entry without `*` is added to every category. A pattern is tested against every name the obfuscator considers, and a UI namespace counts as kept when a pattern matches the namespace itself or anything inside it (`fm_shop.*` keeps the namespace `fm_shop` and all its elements). With nothing connected, the Obfuscate node warns, because vanilla names and paths would be hashed too.

Exclusion files come from the scanner, as the Scan Packs node or on the command line:

```
strata scan "C:/XboxGames/Minecraft for Windows/Content/data/resource_packs" vanilla.exclusions.json --name Vanilla
```

It accepts a single pack (a folder with `manifest.json`) or a folder of packs, expands `__brarchive` archives without letting empty stub entries hide real files, reads compiled `MCB` particles, and records everything listed under Scanner records in the sections below, including names that are only used and never defined. The newest `vanilla*` pack version becomes the exclusion file's game version.

Exclusion files are JSON: `{"format": "strata-exclusions", "version": 1, "meta": {...}, "fields": {...}}`, where `fields` holds one list per category named in the Scanner records sections below. Files with the earlier `strata-references` header, and files without a header (the older plain index), still load.

Packs obfuscated with the same hash key and Hash Format produce the same hashes, so two packs that both belong to you stay compatible without any exclusion file. Exclusion files are for packs that are not obfuscated, or not obfuscated with your key.

## Mappings file

Every renamed name the server might send is recorded with a category. The Write Mappings node writes them grouped by category. There is no flat layout: the same original can legitimately exist in two categories with different hashes (a particle and a sound both called `cc_re:sand_storm`), and only the category tells them apart.

| Category | Example |
|---|---|
| `entities` | `onyx:ural` |
| `attachables` | `onyx:sword` |
| `geometry` | `geometry.ural` |
| `animations` | `animation.ural.walk` |
| `animationControllers` | `controller.animation.ural.main` |
| `particles` | `onyx:spark` |
| `sounds` | `mob.ural.hurt` |
| `itemTextures` | `ural_egg` |
| `terrainTextures` | `ruby_ore` |
| `texturePaths` | `textures/ui/shop` (no extension, the way forms and atlases write it) |
| `cullingRules` | `onyx:culling.crate` |
| `fogs` | `onyx:toxic_fog` |

## Deferred

Problems we know about and decided to solve after the format review.

- **Wildcards over custom bones.** Vanilla render controllers use prefix (`Bag*`, `leg*`), suffix (`*arm`) and contains (`*saddle*`) bone wildcards. They only target vanilla bones, so they keep working. A pack whose own render controller points a wildcard at its own custom bones stops matching once those bones are hashed.

## Terms

- **Defines**: names this file type creates that other files can point at.
- **References**: names this file type uses from somewhere else.
- **Rule**: what the obfuscator hashes and what it keeps.
- **Scanner records**: what goes into an exclusion file, so packs obfuscated against it never break that pack.
- **Mappings**: which original to hashed pairs go into the mappings file, because the server can send them over the network.
- **Hash**: `oStr`, an HMAC of the name keyed with the hash key. By default HMAC-MD5, first 10 hex characters, digits mapped to `q`-`z`; the Hash Format rule changes the algorithm, characters, length and prefix. Deterministic, so the same name hashes the same in every file and every pack built with the same key and format.
- **Keep if excluded**: the name stays as-is when any connected exclusion set contains it, otherwise it is hashed.
- **Found by**: *scanned* means the game loads every file in the folder, so file names are free to hash. *Exact name* means the game looks the file up by path, so it must never be renamed.

## Structure

The Obfuscate node is a group (see `graphs.md`). Inside it, rule nodes feed one Obfuscator node:

| Rule | Hashes |
|---|---|
| Hash Format | nothing itself; sets algorithm (`md5`, `sha256`), characters (`letters`, `hex`, `lowercase`), length and prefix |
| File Paths | folder and file names and every path reference; holds the trash path settings |
| Entities | client entity and attachable identifiers, their lang names and sound keys |
| Animations | animation ids, animation controller ids and controller state names (two switches) |
| Models | geometry ids, bone names, locators (three switches) |
| Render Controllers | render controller ids and array names |
| Short Names | the short names entities give animations, textures, geometry and materials |
| Materials, Particles, Sounds, UI | what their sections below describe; UI also has Shuffle order |
| Texture Atlases | item_texture and terrain_texture keys (two switches) |
| World | fog and block culling identifiers (two switches) |

A rule decides a kind of name everywhere it appears, not one folder. Turning Sounds off keeps sound names in sound_definitions, sounds.json, entities, animations, particles, biomes and UI alike, so a pack never ends up half renamed. Deleting a rule node is the same as switching all of it off; with no rules connected nothing is hashed. Every rule has a Keep names list, where `*` matches anything, for names that rule alone should leave as they are. All rules share the hash function and the connected exclusions.

## Global decisions

- Namespaces are always hashed, except `minecraft`.
- Molang is never rewritten, including identifiers inside Molang string literals.
- Bone names, locator names and short names that any exclusion set lists are kept, everything else is hashed.
- `font/`, `texts/`, `materials/` and `scripts/` are never renamed. Scripts belong to behavior packs; when a pack bundles them they pass through untouched, because the manifest and imports refer to them by path.
- Paths are hashed per segment and keep their extension. Only a real file extension counts (`.png`, `.ogg`, `.json` and the like), so a file `cave.1.ogg` and the extensionless reference `cave.1` both hash the name `cave.1`.
- Wildcards get no special treatment. A render controller bone key containing `*` stays exactly as written, so it keeps matching referenced (vanilla) bones but not hashed custom bones. Packs that need wildcards over custom bones can add a plugin node.

---

## Client entities and attachables

`entity/**/*.json` (`minecraft:client_entity`) and `attachables/**/*.json` (`minecraft:attachable`). Found by: scanned. Both share the same `description` layout; only the root key and the meaning of `identifier` differ.

### Defines

| Name | Example | Used by |
|---|---|---|
| Entity identifier | `onyx:ural` | server (entity spawn packets), lang keys `entity.<id>.name`, spawn egg lang keys |
| Attachable identifier | `onyx:sword` | server item id when there is no `item` map |
| Short names | `default`, `walk`, `body` | render controllers (`Geometry.`/`Texture.`/`Material.`), animation controllers, `scripts.animate`, animation effect events |
| Public Molang variables | `variable.attack_time` | attachables and other entities via `scripts.variables` |

### References

| Field | Points at |
|---|---|
| `textures` values | texture paths |
| `geometry` values | geometry identifiers |
| `materials` values | material identifiers, `child:parent` chains |
| `animations` values | animation and animation controller identifiers |
| `animation_controllers` (legacy list) | animation controller identifiers |
| `particle_emitters` (legacy) | animation identifiers |
| `particle_effects` values | particle identifiers |
| `sound_effects` values | sound definition names |
| `render_controllers` | render controller identifiers |
| `spawn_egg.texture` | `item_texture.json` key |
| `item` keys (attachables) | item identifiers |
| Molang in `scripts`, conditions | variables, queries, identifier literals |

### Rule

| Field | Treatment |
|---|---|
| `identifier` | hashed as `namespace:name` unless it is an excluded entity or attachable; recorded in mappings |
| `textures` | key: short name rule; value: path rule |
| `geometry` | key: short name rule; value: geometry rule |
| `materials` | key: short name rule; value: each `:` part kept if excluded, else hashed |
| `animations` | key: short name rule; value: `animation.`/`controller.animation.` prefix kept, rest hashed unless excluded |
| `animation_controllers` (legacy) | same as `animations` |
| `particle_emitters` (legacy) | same as `animations` |
| `particle_effects` | key: short name rule; value: particle rule |
| `sound_effects` | key: short name rule; value: sound name rule |
| `render_controllers` | `controller.render.` prefix kept, rest hashed unless excluded; Molang conditions untouched |
| `spawn_egg.texture` | item texture key rule |
| `scripts.animate` | short name rule; Molang conditions untouched |
| `scripts.*` everything else | untouched |
| `item` (attachables) | untouched |
| `min_engine_version`, `enable_attachables`, `hide_armor`, `held_item_ignores_lighting`, `held_item_scale`, `spawn_egg.base_color`, `spawn_egg.overlay_color`, `spawn_egg.texture_index` | untouched |
| File path | hashed |

### Scanner records

- `entities`: every client entity identifier
- `attachables`: every attachable identifier
- `shortNames`: every key of `textures`, `geometry`, `materials`, `animations`, `particle_effects`, `sound_effects`, `particle_emitters`, the legacy `animation_controllers` entries, and every `scripts.animate` entry

### Mappings

- Entity identifiers: sent in actor spawn packets.
- Attachable identifiers: equal to the item identifier the server registers.

### Open questions

- When an attachable has an `item` map its identifier is never used, so recording it in mappings only adds a dead entry.

---

## Geometry

`models/**/*.json`. Found by: scanned. Two layouts: current (`minecraft:geometry` array, identifier in `description`) and legacy (`geometry.*` keys at the root, `geometry.child:geometry.parent` inheritance).

### Defines

| Name | Example | Used by |
|---|---|---|
| Geometry identifier | `geometry.ural` | entities, attachables, behavior pack blocks (`minecraft:geometry`), block culling rules, Geyser mappings |
| Bone names | `turret`, `rightArm` | animations, render controller `part_visibility`/`materials`, attachables binding to their wearer's bones, behavior pack `bone_visibility`, block culling rules |
| Locator names | `muzzle`, `lead_hold` | animation and animation controller effect events |

### References

| Field | Points at |
|---|---|
| legacy `geometry.a:geometry.b` key | parent geometry identifier |
| `bones[].parent` | bone in the same geometry |
| `bones[].texture_meshes[].texture` | entity texture short name |
| `bones[].binding` | Molang, resolves to a bone of the wearer |
| per-face `uv.*.material_instance` | behavior pack block `minecraft:material_instances` |

### Rule

| Field | Treatment |
|---|---|
| identifier (both layouts) | `geometry.` prefix kept, rest hashed unless excluded; each `:` part separately; recorded in mappings |
| `bones[].name`, `bones[].parent` | bone rule: kept if excluded, otherwise hashed |
| `bones[].locators` keys | locator rule |
| `bones[].texture_meshes[].texture` | short name rule |
| `bones[].binding` | untouched (Molang) |
| `material_instance` | untouched |
| `texture_width`, `texture_height`, `visible_bounds_*`, `texturewidth`, `textureheight`, `item_display_transforms`, `pivot`, `rotation`, `bind_pose_rotation`, `mirror`, `inflate`, `reset`, `neverRender`, `cubes`, `poly_mesh` | untouched |
| File path | first two segments kept (`models/entity/`), rest hashed |

### Scanner records

- `geometry`: every identifier, without the `:parent` part
- `boneNames`: every bone name
- `locators`: every locator name
- `shortNames`: every `texture_meshes[].texture`

### Mappings

- Geometry identifiers: the server sends them in custom block and item component NBT.
- Bone names are not recorded, although custom block components can send `bone_visibility` names. Bone names are short common words, so adding them risks replacing unrelated strings.

### Open questions

- Why the first two path segments are kept is inherited from the Java version and unverified; the game scans `models/` recursively.

---

## Animations

`animations/**/*.json`. Found by: scanned.

### Defines

| Name | Example | Used by |
|---|---|---|
| Animation identifier | `animation.ural.walk` | entities, attachables, animation controllers, `AnimateEntityPacket` |

### References

| Field | Points at |
|---|---|
| `bones` keys | bone names of whatever geometry the animation is applied to, which can be a vanilla model |
| `sound_effects.*.effect` | sound short name of the entity playing it |
| `particle_effects.*.effect` | particle short name of the entity playing it |
| `particle_effects.*.locator` | locator name |
| Molang in bone channels, `anim_time_update`, `start_delay`, `loop_delay`, `blend_weight`, `timeline`, `pre_effect_script` | variables and queries |

### Rule

| Field | Treatment |
|---|---|
| identifier | `animation.` prefix kept, rest hashed unless excluded; recorded in mappings |
| `bones` keys | bone rule |
| `sound_effects.*.effect`, `particle_effects.*.effect` | short name rule (single event or array of events) |
| `particle_effects.*.locator` | locator rule |
| bone channels (`rotation`, `position`, `scale`, `relative_to`), `loop`, `animation_length`, `override_previous_animation`, `anim_time_update`, `start_delay`, `loop_delay`, `blend_weight`, `timeline`, `pre_effect_script`, `bind_to_actor` | untouched |
| File path | hashed |

### Scanner records

- `animations`: every identifier
- `boneNames`: every `bones` key
- `shortNames`: every effect name
- `locators`: every effect locator

### Mappings

- Animation identifiers: sent in `AnimateEntityPacket`.

---

## Animation controllers

`animation_controllers/**/*.json`. Found by: scanned.

### Defines

| Name | Example | Used by |
|---|---|---|
| Controller identifier | `controller.animation.ural.main` | entities, attachables, `AnimateEntityPacket` |
| State names | `idle`, `firing` | only the same controller (`initial_state`, transitions), and `AnimateEntityPacket` `next_state` |

### References

| Field | Points at |
|---|---|
| `states.*.animations` | animation short names of the entity, plain or `{"name": "molang"}` |
| `states.*.transitions` keys | state names in the same controller |
| `states.*.particle_effects[].effect`, `sound_effects[].effect` | particle and sound short names |
| `states.*.particle_effects[].locator` | locator name |
| Molang in transition conditions, `animations` conditions, `on_entry`, `on_exit`, `pre_effect_script` | variables and queries |

### Rule

| Field | Treatment |
|---|---|
| identifier | `controller.animation.` prefix kept, rest hashed unless excluded; recorded in mappings |
| state names, `initial_state`, transition targets | always hashed, they never leave the controller |
| `states.*.animations` names | short name rule; conditions untouched |
| effect names | short name rule |
| effect locators | locator rule |
| `blend_transition`, `blend_via_shortest_path`, `on_entry`, `on_exit`, `bind_to_actor`, transition conditions | untouched |
| File path | hashed |

### Scanner records

- `animationControllers`: every identifier
- `shortNames`: every `states.*.animations` name and every effect name
- `locators`: every effect locator

### Mappings

- Controller identifiers: sent in `AnimateEntityPacket`.

### Open questions

- `AnimateEntityPacket` also carries `next_state`. A server targeting a state of a pack controller would send the original state name, which is hashed but not in mappings. State names are common words, so adding them risks replacing unrelated strings. Most servers use the runtime controller and the default state, so this is left out for now.

---

## Render controllers

`render_controllers/**/*.json`. Found by: scanned.

### Defines

| Name | Example | Used by |
|---|---|---|
| Render controller identifier | `controller.render.ural` | entities, attachables |
| Array names | `Array.skins` | only the same render controller |

### References

| Field | Points at |
|---|---|
| `Geometry.x`, `Texture.x`, `Material.x` anywhere in `geometry`, `textures`, `materials`, `arrays` | entity short names, inside Molang expressions such as `q.is_baby ? Texture.baby : Texture.default` |
| `Array.x` | array defined in `arrays` of the same render controller |
| `materials` and `part_visibility` keys | bone names, or `*` wildcards |
| Molang in `part_visibility` values, colors, `uv_anim` | variables and queries |

The prefixes are case-insensitive Molang: vanilla writes both `Texture.default` and `texture.default`, and both `Array.x` and `array.x`. Names are case-sensitive in practice: across vanilla and the test pack every reference matches its entity key exactly.

### Rule

| Field | Treatment |
|---|---|
| identifier | `controller.render.` prefix kept, rest hashed unless excluded; not recorded in mappings |
| `Geometry.x`, `Texture.x`, `Material.x` | prefix kept as written in any case, name by the short name rule, wherever it appears in a string |
| `Array.x` | prefix kept as written, name always hashed |
| `materials` and `part_visibility` keys | bone rule; keys containing `*` kept as written |
| `part_visibility` values, `color`, `overlay_color`, `on_fire_color`, `is_hurt_color`, `uv_anim`, `ignore_lighting`, `filter_lighting`, `light_color_multiplier`, `rebuild_animation_matrices` | untouched |
| File path | hashed |

### Scanner records

- `renderControllers`: every identifier
- `shortNames`: every `Geometry.`/`Texture.`/`Material.` name, prefix matched case-insensitively
- `boneNames`: every `materials` and `part_visibility` key without `*`

### Mappings

- None. The server never sends render controller identifiers.

---

## Materials

`materials/*.material` (JSON with a `materials` object) and `materials/*.json` (lists of `.material` files to load). Found by: exact name. The game loads the files listed in `common.json`, `fancy.json`, `sad.json` and `gameface.json`, so a pack adds materials by overriding `materials/entity.material` and the like.

Current vanilla ships the real `.material` files as plain files and puts empty stubs with the same names into `__brarchive/materials.brarchive`. An empty archive entry must never shadow a real file.

### Defines

| Name | Example | Used by |
|---|---|---|
| Material name | `blend_no_culling:entity_alphablend` defines `blend_no_culling` with parent `entity_alphablend` | entity and attachable `materials` values, particle `basic_render_parameters.material` |

### References

| Field | Points at |
|---|---|
| `materials` keys after `:` | parent material, usually vanilla |
| `materials/*.json` entries | `.material` file paths |

### Rule

| Field | Treatment |
|---|---|
| `materials` keys | each `:` part kept if excluded, otherwise hashed; `version` kept |
| material bodies (`+states`, `+defines`, `+samplerStates`, `msaaSupport`, shaders) | untouched |
| `materials/*.json` | untouched |
| File path | never renamed |

### Scanner records

- `materials`: every `:` part of every `materials` key in readable `.material` files, plus every material name vanilla entities, attachables and particles use. Usage is needed because definitions alone miss names such as `entity_dissolve_layer0.skinning`.

### Mappings

- None. The server never sends material names.

Dots in material names (`entity_dissolve_layer0.skinning`) are only a visual separator, so the whole name is one name.

---

## Textures

Images (`.png`, `.tga`, `.jpg`, `.jpeg`, `.hdr`) anywhere under `textures/`, plus the files that describe them. References to images leave the extension off (`textures/items/apple`); the game picks the file with whichever image extension exists.

| File | Found by | Content |
|---|---|---|
| images | by path | pixels |
| `textures/item_texture.json` | exact name | item icon keys to paths |
| `textures/terrain_texture.json` | exact name | block texture keys to paths |
| `textures/flipbook_textures.json` | exact name | animated terrain tiles |
| `*.texture_set.json` | next to its image, same base name | PBR layers |
| sidecar `<image>.json` (`nineslice_size`, `base_size`, `tiled`; or Aseprite `frames`/`meta`) | next to its image, same base name | UI slicing and sprite frames |
| `textures/textures_list.json`, `textures/texture_list.json` | exact name | paths to preload |

### Defines

| Name | Example | Used by |
|---|---|---|
| Texture path | `textures/entity/ural` | entities, attachables, particles, UI, atlases, flipbooks, server forms |
| Item texture key | `ural_egg` | spawn eggs, server item components (`minecraft:icon`) |
| Terrain texture key | `ruby_ore` | `blocks.json`, flipbooks, server block components (`material_instances`) |

### References

| Field | Points at |
|---|---|
| atlas `texture_data.*.textures` | a path string, an object `{"path", "overlay_color", "tint_color", "variations"}`, or an array of either |
| `variations[].path` | texture path |
| `flipbook_texture` | texture path |
| `atlas_tile` | terrain texture key |
| texture set layer strings (`color`, `normal`, `heightmap`, `metalness_emissive_roughness`, `metalness_emissive_roughness_subsurface`) | image in the same folder, unless it starts with `#` or is a color array |
| texture lists | texture paths |

### Rule

| Field | Treatment |
|---|---|
| image path | path rule: kept if excluded or under a never-renamed folder, otherwise every segment after `textures/` hashed, extension kept |
| sidecar and texture set file names | hashed with the same base name as their image, so they stay paired; `.texture_set.json` suffix kept |
| item and terrain texture keys | kept if excluded, otherwise hashed; recorded in mappings |
| atlas paths in every form, `variations[].path` | path rule |
| `flipbook_texture` | path rule |
| `atlas_tile` | terrain key rule |
| texture set layer names | hashed unless the image it points at is in the exclusions |
| texture list entries | path rule |
| `resource_pack_name`, `texture_name`, `padding`, `num_mip_levels`, `overlay_color`, `tint_color`, `weight`, `quad`, `ticks_per_frame`, `frames`, `atlas_index`, `atlas_tile_variant`, `blend_frames`, `replicate`, sidecar contents, image pixels | untouched |

### Scanner records

- `paths` and `pathsNoExt`: every file path, with and without extension
- `itemTextures`: every `item_texture.json` key
- `terrainTextures`: every `terrain_texture.json` key

### Mappings

- Item texture keys (`itemTextures`) and terrain texture keys (`terrainTextures`): sent in item and block component NBT. Both are plain words and can collide with ordinary text.
- Image paths without extension (`texturePaths`): the server sends them itself, for example form button icons. Paths contain `/`, so they cannot collide with ordinary text. Rewriting paths inside form JSON is the server's job.

---

## Sounds

| File | Found by | Content |
|---|---|---|
| `sounds/sound_definitions.json` | exact name | sound names to audio files |
| `sounds.json` | exact name | engine events to sound names, per block sound group, per entity, and for individual events |
| `sounds/music_definitions.json` | exact name | biome to music sound name |
| audio (`.ogg`, `.fsb`, `.wav`) | by path | referenced without extension |

### Defines

| Name | Example | Used by |
|---|---|---|
| Sound name | `mob.ural.fire` | `sounds.json`, music definitions, entity `sound_effects`, `PlaySoundPacket` |
| Block sound group | `stone`, `nylium` | `blocks.json` `sound`, the server's block definitions |

### References

| Field | Points at |
|---|---|
| `sound_definitions.*.sounds[]`, `sounds[].name` | audio paths |
| `sound_definitions.*.subtitle` | lang key |
| `sounds.json` event values: a string, `{"sound": ...}` or `{"sounds": ...}` | sound names; `""` means silence |
| `sounds.json` `entity_sounds.entities` keys, also under `interactive_sounds` | entity identifiers; vanilla ones are written without `minecraft:` |
| `music_definitions.*.event_name` | sound name |

### Rule

| Field | Treatment |
|---|---|
| sound names, wherever they appear | kept if excluded, otherwise hashed; recorded in mappings |
| audio paths | path rule |
| `sounds.json` entity keys | entity identifier rule when namespaced; keys without a namespace are vanilla and kept |
| `sounds.json` event names (`ambient`, `hurt`, `step`, `item.use.on`, ...) | untouched, they are engine vocabulary |
| block sound group names | untouched |
| `category`, `min_distance`, `max_distance`, `volume`, `pitch`, `weight`, `stream`, `is3D`, `load_on_low_memory`, `interruptible`, `min_delay`, `max_delay` | untouched |
| `subtitle` | untouched until the lang section |

### Scanner records

- `sounds`: every sound definition name
- `paths` and `pathsNoExt`: every audio path

### Mappings

- Sound names (`sounds`): sent in `PlaySoundPacket` and `StopSoundPacket`.

---

## Particles

`particles/**/*.json` (`particle_effect`). Found by: scanned. Current vanilla ships most particles as compiled `MCB` binaries; the identifier is still readable after the `particle_effect` string, which is all the scanner needs.

### Defines

| Name | Example | Used by |
|---|---|---|
| Particle identifier | `onyx:spark` | entity `particle_effects`, other particles' events, `SpawnParticleEffectPacket` |
| Event names | `burst` | only the same particle (lifetime events, sequences) |

### References

| Field | Points at |
|---|---|
| `description.basic_render_parameters.material` | material name |
| `description.basic_render_parameters.texture` | texture path |
| `events.*` `particle_effect.effect`, also inside `sequence` and `randomize` | particle identifier |
| `events.*` `sound_effect.event_name`, also nested | a sound name, or a `sounds.json` individual event key with the same spelling |
| Molang in components and `pre_effect_expression` | variables and queries |
| `minecraft:particle_expire_if_in_blocks` and similar | block identifiers |

### Rule

| Field | Treatment |
|---|---|
| identifier | namespace and name hashed unless excluded; recorded in mappings |
| `material` | material rule |
| `texture` | path rule |
| event `particle_effect.effect` | particle identifier rule |
| event `sound_effect.event_name` | sound name rule. `sounds.json` individual event keys get the same rule, so the reference matches whichever one the game resolves |
| event names | untouched |
| components, curves, Molang, block lists | untouched |
| File path | hashed |

### Scanner records

- `particles`: every identifier, from JSON or from the `MCB` string table
- `sounds`: every `sounds.json` individual event key and individual named sound key, since particle sound events and biome ambient sounds can point at them

### Mappings

- Particle identifiers (`particles`): sent in `SpawnParticleEffectPacket`.

---

## UI

`ui/**/*.json`, `ui/_ui_defs.json`, `ui/_global_variables.json`. Found by: vanilla screen files by exact name, everything else through `_ui_defs.json`. Every file with a `namespace` defines top-level elements; files override vanilla screens by reusing the vanilla namespace.

### Defines

| Name | Example | Used by |
|---|---|---|
| Namespace | `fm_shop` | other UI files |
| Element | `fm_shop.root`, also custom elements added to a vanilla namespace | other UI files, `$variables`, factories, `anims` |
| Control names | children inside `controls` | `control_name` in modifications, `source_control_name` |
| `$variables` | `$controls` | everything inheriting the element |
| Property bag and binding names | `#title_text` | engine data and bindings |

### References

An element reference is any whole string of the form `ns.element`, `@ns.element` or `@element` (same namespace), or the `base` part of `name@base`, which appears both as a key and as a string value (factory `control_ids` such as `"chat_item": "chat_item@onyx_hud.chat_grid_item"`). They appear in `name@base` keys, `$variable` values, `control_name` and `control_ids` in factories, `grid_item_template`, `anims` and elsewhere. Bases that are variables (`name@$checked_control`) resolve at runtime and are left alone; the variable's value is rewritten where it is set. Other references: texture paths, `sound_name`, `text` lang keys and bindings, `button.*` ids.

### Rule

The obfuscator first collects every namespace and top-level element the pack declares, and every control name it statically defines as a child. A namespace the vanilla exclusions do not have is custom; an element is custom when its namespace is custom or vanilla has no element with that name in that namespace; every control name the pack defines statically is hashed, vanilla-named or not, because control names are scoped to their element tree. Then it rewrites every key and string in every UI file.

Control names can also be created at runtime from variables, for example `"$name": "slides1"` passed into a vanilla toggle that names its control after `$toggle_view_binding_name`. Such names are never declared statically, so both the variable value and the `source_control_name` pointing at it stay untouched and keep matching.

| Field | Treatment |
|---|---|
| custom namespace | hashed, both the `namespace` value and every reference prefix |
| custom element | name hashed in its definition and in every exact reference, wherever the reference is stored |
| vanilla namespaces and elements | untouched |
| strings that only contain a namespace (`$close_button_texture`), undeclared namespaces (`menu.play`) | untouched |
| `text` values | untouched |
| custom control names | hashed in their definitions (`name` or `name@base` keys whose value is a control object, inside `controls`, `$variable` control arrays and `modifications` `value`), in `bindings[].source_control_name`, in bare `modifications[].control_name`, and in the name part of `name@base` values |
| control names that only exist at runtime | untouched |
| `$variables`, bindings, `button.*` ids | untouched |
| texture paths | path rule |
| `sound_name` | sound name rule |
| `_ui_defs.json` entries | path rule |
| File path | hashed, except vanilla screen files |

### Scanner records

- `uiElements`: every `namespace.element` pair of every top-level element

### Mappings

- None. Servers pick custom form layouts by marker text that UI bindings match on, which is plain text and stays untouched.

### Open questions

- A `$variable` meant as display text whose value exactly equals a custom element reference would be rewritten. No such case found so far.
- A binding or modification that targets a child inherited from a vanilla base breaks only if the pack also defines its own control with that exact name somewhere. Both test packs only reference their own children.


### Shuffle order

On by default in the UI rule. After renaming, every UI file with a `namespace` has its elements reordered, each element's properties reordered, and the properties of every child under `controls`, `$controls` and `$hover_controls` reordered, recursively. Arrays keep their order, so control order, bindings and anything else positional are untouched; JSON UI reads objects by key, so the game sees the same UI. The order is seeded from the hash key and the file path, so the same key gives the same files every build.

---

## Language files

`texts/*.lang` (`key=value` lines, `##` comments), `texts/languages.json`, `texts/language_names.json`. Found by: exact name.

### Defines

| Name | Example | Used by |
|---|---|---|
| Lang keys | `onyx.ui.play`, `entity.onyx:ural.name` | UI `text` and `$variables`, sound subtitles, the server (chat, titles, forms), and the game itself for entity, spawn egg and item names |

### References

The game builds some keys from identifiers, so these keys point at names the obfuscator hashes:

| Key | Built from |
|---|---|
| `entity.<id>.name` | entity identifier |
| `item.spawn_egg.entity.<id>.name` | entity identifier |
| `item.<id>.name` | item identifier, which equals the attachable identifier |

### Rule

| Field | Treatment |
|---|---|
| the three key shapes above, when `<id>` is a custom entity or attachable in the pack | `<id>` replaced by its hashed identifier, the same value as in mappings |
| every other key, including custom keys such as `onyx.ui.*` | untouched; packs build such keys dynamically (`'%onyx.ui.style.' + #form_button_text`) and servers send them |
| values, comments | untouched |
| file bytes | rewritten only when a key changes; BOM, line endings and every other byte stay as they were |
| `languages.json`, `language_names.json` | untouched |
| File path | never renamed |

Custom entity and attachable identifiers are collected in the first pass, so lang files can be processed in any order.

### Scanner records

- Nothing new. Vanilla identifiers are already in `entities` and `attachables`.

### Mappings

- Nothing new. The identifiers inside the keys are already recorded as `entities` and `attachables`.

### Open questions

- Hashing custom lang keys could become a toggle for packs that only use static keys.

---

## Fonts

`font/**` (glyph sheets such as `glyph_E1.png`, `.json`, `.fontdata`, `.ttf`) and `texts/<language>/font/**`. Found by: exact name. Everything is untouched and never renamed.

---

## Blocks

| File | Found by | Content |
|---|---|---|
| `blocks.json` | exact name | per block id: textures, sound group, shading |
| `block_culling/**/*.json` | scanned | culling rules for custom block geometry |

### Defines

| Name | Example | Used by |
|---|---|---|
| Culling rule identifier | `onyx:culling.crate` | block geometry components the server sends |

### References

| Field | Points at |
|---|---|
| `blocks.json` keys | block identifiers defined by the server |
| `blocks.json` `textures`, `carried_textures` (string or per-face object) | terrain texture keys |
| `blocks.json` `sound` | block sound group |
| culling `rules[].geometry_part.bone` | bone of the block's geometry |

### Rule

| Field | Treatment |
|---|---|
| `blocks.json` keys | untouched; block identifiers belong to the server |
| `textures`, `carried_textures` | terrain key rule |
| `sound`, `isotropic`, `ambient_occlusion_exponent`, `brightness_gamma` | untouched |
| culling identifier | `minecraft:` identifiers kept whole, others hashed like namespaced identifiers; recorded in mappings |
| culling `geometry_part.bone` | bone rule |
| culling `cube`, `face`, `direction`, `condition` | untouched |
| File path | `blocks.json` never renamed; culling files hashed |

### Scanner records

- `boneNames`: every culling rule bone

### Mappings

- Culling rule identifiers (`cullingRules`): sent in custom block geometry components.

---

## Items

`items/**/*.json` (`minecraft:item`, legacy resource pack item definitions). Found by: scanned. Vanilla still ships 52 of them in format `1.10`; servers normally define items themselves and send the icon in component NBT.

### References

| Field | Points at |
|---|---|
| `description.identifier` | item identifier owned by the server |
| `components.minecraft:icon`, as a string or `{"texture": ...}` | `item_texture.json` key |

### Rule

| Field | Treatment |
|---|---|
| `description.identifier` | untouched, like block identifiers |
| `minecraft:icon` | item texture key rule |
| `description.category`, `minecraft:use_animation`, `minecraft:rarity`, `minecraft:render_offsets` | untouched |
| File path | hashed |

### Scanner records

- Nothing new.

### Mappings

- Nothing new. Icon keys are already recorded as `itemTextures`.

---

## Fogs

`fogs/**/*.json` (`minecraft:fog_settings`). Found by: scanned.

### Defines

| Name | Example | Used by |
|---|---|---|
| Fog identifier | `onyx:toxic_fog` | `biomes_client.json`, client biome files, the server's fog command (`PlayerFogPacket`) |

### References

| Field | Points at |
|---|---|
| `fog_identifier` in `biomes_client.json` and `biomes/**/*.client_biome.json` (under `minecraft:fog_appearance`) | fog identifier |

### Rule

| Field | Treatment |
|---|---|
| fog identifier | `minecraft:` identifiers kept whole, others hashed like namespaced identifiers; recorded in mappings |
| every `fog_identifier`, wherever it appears in biome files | the same rule |
| `distance`, `volumetric`, colors, `water_fog_color` | untouched |
| File path | hashed |

### Scanner records

- Nothing new. Vanilla fogs are all `minecraft:` and kept by prefix.

### Mappings

- Fog identifiers (`fogs`): sent by the fog command.

---

## Biomes and environment

| File | Found by | Content |
|---|---|---|
| `biomes/**/*.client_biome.json` | scanned | per biome: fog, water, sky and foliage colors, ambient sounds, music, Vibrant Visuals setting ids |
| `biomes_client.json` | exact name | legacy per biome fog and water settings |
| `atmospherics/`, `color_grading/`, `lighting/`, `water/` | scanned | Vibrant Visuals settings, each with an identifier |
| `shadows/`, `pbr/` | scanned | global settings |
| `cameras/` | scanned | camera presets, mostly compiled `MCB` |

### References

| Field | Points at |
|---|---|
| `minecraft:fog_appearance.fog_identifier`, `biomes_client.json` `fog_identifier` | fog identifier (see Fogs) |
| `minecraft:ambient_sounds` values, as a string or `{"asset": ...}` | a sound name, or a `sounds.json` individual named sound key such as `ambient.underwater.loop` |
| `minecraft:biome_music.music_definition` | `music_definitions.json` key |
| `minecraft:atmosphere_identifier`, `color_grading_identifier`, `lighting_identifier`, `water_identifier` | Vibrant Visuals setting identifiers |

### Rule

| Field | Treatment |
|---|---|
| `fog_identifier` | fog rule |
| `minecraft:ambient_sounds` values and `asset` | sound name rule. `sounds.json` individual named sound keys get the same rule, so the reference matches either kind |
| `music_definition` | untouched; music definition keys are not hashed |
| biome identifiers | untouched |
| Vibrant Visuals identifiers and their references | untouched |
| colors, precipitation, shadows, PBR, camera presets | untouched |
| File path | hashed, except `biomes_client.json` |

### Scanner records

- Nothing new beyond the `sounds` note in the Sounds and Particles sections.

### Mappings

- Nothing new.

## Pack tools

Value nodes that reshape a pack before or after the rest of the graph:

- **Edit Manifest**: sets the name, description, version (header and every module, like `1.2.3`) and minimum engine version, and can give the header and modules new random UUIDs. Empty settings keep what the pack has. The game caches packs by UUID and version, so a release build usually sets one of them.
- **Filter Files**: keeps files matching Include (default `**`) and drops those matching Exclude, warning when the manifest is dropped.
- **Merge Packs**: combines any number of packs in connection order. The first pack's manifest is kept; for other shared paths the later or the first pack wins.
- **Add Files**: copies a folder into the pack, at the root or inside a folder, overwriting existing files or not.

Patterns work as everywhere else: `*.png` by name, `textures/**` by path.

## Packaging

These nodes run after obfuscation and do not rename anything.

### Keys

Hash keys and encryption keys come from Key nodes connected to Obfuscate's and Encrypt's `key` inputs. A Key node has two modes:

- **text**: the key is typed as it is. For hashing any length works; for encryption it must be 32 printable ASCII characters.
- **symbols**: the key is 32 random bytes from `01` to `FF`, like the Java packtool made, typed and stored as 64 hex characters. Encrypt's per-file keys follow the content key's mode, so a symbols content key gives symbols per-file keys.

Generate fills in a random key of the current mode. A text key hashes exactly like the earlier inline `hashKey` setting, so existing packs keep their names. Encrypt needs a connected key. To give the server the same key, connect that Key node to a Write Key node too: it writes the key as typed, the text itself or the hex for symbols, which the server decodes. Save it next to the pack as `<file>.key`, where servers look for it.

### BrArchive

BrArchive is a group of two steps:

- **Archive Folders**: every `.json` file inside a folder (except `*.texture_set.json`) goes into `__brarchive/<folder>.brarchive`, one archive per folder, the way vanilla ships. Root files such as `manifest.json` stay loose, and so does anything matching its Keep loose patterns.
- **Mark Optimized**: the manifest header gets `"pack_optimization_version": [0, 1, 0]`. Without a manifest it only warns. It also works on its own, outside the group.

### Encrypt

Encrypt is a group: file rules feed one Encrypt Files node, and a file is encrypted when any rule picks it and Leave Readable does not.

| Rule | Picks |
|---|---|
| Images | `.png`, `.tga`, `.jpg`, `.jpeg` |
| JSON | `.json`, `.material` |
| Sounds | `.ogg`, `.fsb`, `.wav`, `.mp3` |
| Text | `.lang`, `.txt` |
| Other Files | everything the four above do not cover |
| Match Files | your own patterns (in the library, not in the default group) |
| Leave Readable | excludes its patterns from every rule above |

The default group has all of them but Match Files, so every file is encrypted. Delete rules to encrypt less: keeping only Images is the old `images` scope. `manifest.json`, `pack_icon.png` and `contents.json` are never encrypted. Each encrypted file gets its own random key and AES-256-CFB8, with the IV set to the key's first 16 bytes; files no rule picks are listed without a key.

`contents.json` lists every file (manifest and icon first, without keys) and is written as: 4 bytes version `0`, 4 bytes magic `FC B9 CF 9B`, zero padding to `0x10`, one length byte and the manifest header `uuid`, zero padding to `0x100`, then the JSON `{"content":[{"path","key"}]}` encrypted with the content key. The content key comes from the connected Key node, so the server can be given the same key every build.

Encrypt and BrArchive work in either order. Files are encrypted one by one, also inside archives, and `contents.json` always lists original paths (`entity/ural.entity.json`), never archive paths.

### Write Zip

Writes the pack as `.zip` or `.mcpack`, manifest first, deflated where that is smaller. The content key is written separately by Write Key.
