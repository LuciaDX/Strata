import { Pack } from "@strata/core";
import { Key, archiveFolder, encryptBytes, isBrarchive, readBrarchive, readManifest, writeBrarchive, writeContents } from "@strata/nodes";
import { fileRules, fileSelector } from "./rules.js";

const ROOT_FILES = new Set(["manifest.json", "pack_icon.png", "contents.json"]);

export const encryptFiles = {
  type: "encrypt.files",
  title: "Encrypt Files",
  icon: "lock",
  category: "Encryption",
  description: "Encrypts the files the connected rules pick with AES-256-CFB8 and writes the encrypted contents.json the game expects",
  inputs: {
    pack: "pack",
    key: "key",
    files: { type: "files", multiple: true, optional: true },
  },
  outputs: {
    pack: "pack",
  },
  async run({ inputs, context }) {
    const contentKey = inputs.key;
    contentKey.requireCipherKey();
    const { header } = readManifest(inputs.pack);
    const uuid = header.get("uuid");
    if (typeof uuid !== "string" || uuid === "") {
      throw new Error("manifest.json header has no uuid");
    }
    if (inputs.files.length === 0) {
      context.warn("no file rules connected, nothing is encrypted");
    }

    const shouldEncrypt = fileSelector(inputs.files);
    const content = [{ path: "manifest.json" }];
    if (inputs.pack.has("pack_icon.png")) {
      content.push({ path: "pack_icon.png" });
    }

    let encrypted = 0;
    const protect = (path, data) => {
      if (!shouldEncrypt(path)) {
        content.push({ path });
        return data;
      }
      const key = Key.generate(contentKey.mode).chars;
      content.push({ path, key });
      encrypted++;
      return encryptBytes(data, key);
    };

    const output = new Pack(new Map(), { ...inputs.pack.meta });
    for (const [path, data] of inputs.pack.files) {
      if (ROOT_FILES.has(path)) {
        if (path !== "contents.json") {
          output.set(path, data);
        }
        continue;
      }
      const folder = archiveFolder(path);
      if (folder !== null && isBrarchive(data)) {
        const entries = new Map();
        for (const [name, entry] of readBrarchive(data)) {
          entries.set(name, protect(`${folder}/${name}`, entry));
        }
        output.set(path, writeBrarchive(entries));
        continue;
      }
      output.set(path, protect(path, data));
    }

    output.set("contents.json", writeContents(content, uuid, contentKey.chars));
    context.log(`${encrypted} of ${content.length} listed files encrypted, ${contentKey.mode} keys`);
    return { pack: output };
  },
};

export { fileRules };
