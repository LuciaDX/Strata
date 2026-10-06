import { register } from "node:module";

let shared = false;

export function shareModules(modules) {
  if (shared) {
    return;
  }
  shared = true;
  register(new URL("./module-hook.js", import.meta.url), { data: modules });
}
