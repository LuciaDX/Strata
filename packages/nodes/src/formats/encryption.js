import { createCipheriv, createDecipheriv, getCiphers } from "node:crypto";
import { cfb8 } from "./aes.js";

const NATIVE_CFB8 = getCiphers().includes("aes-256-cfb8");
const CONTENTS_MAGIC = Buffer.from([0xfc, 0xb9, 0xcf, 0x9b]);
const CONTENTS_HEADER_SIZE = 0x100;
const UUID_OFFSET = 0x10;

function cipherParts(key) {
  const bytes = Buffer.from(key, "latin1");
  return [bytes, bytes.subarray(0, 16)];
}

export function encryptBytes(data, key) {
  const [bytes, iv] = cipherParts(key);
  if (!NATIVE_CFB8) {
    return cfb8(data, bytes, iv, false);
  }
  const cipher = createCipheriv("aes-256-cfb8", bytes, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function decryptBytes(data, key) {
  const [bytes, iv] = cipherParts(key);
  if (!NATIVE_CFB8) {
    return cfb8(data, bytes, iv, true);
  }
  const decipher = createDecipheriv("aes-256-cfb8", bytes, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function writeContents(entries, uuid, key) {
  const header = Buffer.alloc(CONTENTS_HEADER_SIZE);
  CONTENTS_MAGIC.copy(header, 4);
  const id = Buffer.from(uuid, "utf8");
  if (id.length > 0xff || UUID_OFFSET + 1 + id.length > CONTENTS_HEADER_SIZE) {
    throw new Error(`Pack uuid "${uuid}" is too long`);
  }
  header[UUID_OFFSET] = id.length;
  id.copy(header, UUID_OFFSET + 1);
  const content = entries.map((entry) => (entry.key ? { path: entry.path, key: entry.key } : { path: entry.path }));
  return Buffer.concat([header, encryptBytes(Buffer.from(JSON.stringify({ content }), "utf8"), key)]);
}

export function readContents(data, key) {
  if (!data.subarray(4, 8).equals(CONTENTS_MAGIC)) {
    throw new Error("contents.json is not encrypted");
  }
  const length = data[UUID_OFFSET];
  const uuid = data.toString("utf8", UUID_OFFSET + 1, UUID_OFFSET + 1 + length);
  const json = JSON.parse(decryptBytes(data.subarray(CONTENTS_HEADER_SIZE), key).toString("utf8"));
  return { uuid, content: json.content };
}
