import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

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

export async function readFolder(root) {
  const files = new Map();
  for (const file of (await walk(root)).sort()) {
    files.set(relative(root, file).split("\\").join("/"), await readFile(file));
  }
  return files;
}
