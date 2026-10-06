import { isArray, isObject } from "@strata/core";
import { JavaRandom, javaStringHash } from "./java.js";

const CONTROL_KEYS = new Set(["controls", "$controls", "$hover_controls"]);

function shuffleMap(map, random) {
  const entries = [...map];
  for (let i = entries.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return new Map(entries);
}

function shuffleElement(element, random) {
  const shuffled = shuffleMap(element, random);
  for (const [key, value] of shuffled) {
    if (!CONTROL_KEYS.has(key) || !isArray(value)) {
      continue;
    }
    for (const entry of value) {
      if (!isObject(entry) || entry.size === 0) {
        continue;
      }
      const name = entry.keys().next().value;
      if (isObject(entry.get(name))) {
        entry.set(name, shuffleElement(entry.get(name), random));
      }
    }
  }
  return shuffled;
}

export function shuffleUi(json, seed) {
  if (typeof json.get("namespace") !== "string") {
    return json;
  }
  const random = new JavaRandom(javaStringHash(seed));
  const shuffled = shuffleMap(json, random);
  for (const [key, value] of shuffled) {
    if (key !== "namespace" && isObject(value)) {
      shuffled.set(key, shuffleElement(value, random));
    }
  }
  return shuffled;
}
