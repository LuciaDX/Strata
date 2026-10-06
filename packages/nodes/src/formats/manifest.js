import { isObject, parseJson } from "@strata/core";

export function readManifest(pack) {
  const data = pack.get("manifest.json");
  if (!data) {
    throw new Error("The pack has no manifest.json");
  }
  const manifest = parseJson(data.toString("utf8"));
  const header = isObject(manifest) ? manifest.get("header") : null;
  if (!isObject(header)) {
    throw new Error("manifest.json has no header");
  }
  return { manifest, header };
}
