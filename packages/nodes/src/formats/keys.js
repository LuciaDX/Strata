import { randomInt } from "node:crypto";

export const KEY_MODES = ["text", "symbols"];
export const KEY_LENGTH = 32;
const TEXT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomText(length) {
  let text = "";
  for (let i = 0; i < length; i++) {
    text += TEXT_CHARACTERS[randomInt(TEXT_CHARACTERS.length)];
  }
  return text;
}

function randomSymbols(length) {
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = 1 + randomInt(255);
  }
  return bytes;
}

export class Key {
  constructor(mode, input) {
    if (!KEY_MODES.includes(mode)) {
      throw new Error(`Unknown key mode "${mode}", expected ${KEY_MODES.join(" or ")}`);
    }
    if (typeof input !== "string" || input === "") {
      throw new Error("The key is empty, type one or generate it");
    }
    if (mode === "symbols") {
      const hex = input.replace(/\s+/g, "").toLowerCase();
      if (!/^([0-9a-f]{2})+$/.test(hex)) {
        throw new Error("A symbols key is written as hex, two characters per byte");
      }
      this.bytes = Buffer.from(hex, "hex");
      if (this.bytes.includes(0)) {
        throw new Error("A symbols key cannot contain the byte 00");
      }
      this.input = hex;
    } else {
      this.bytes = Buffer.from(input, "utf8");
      this.input = input;
    }
    this.mode = mode;
  }

  static generate(mode, length = KEY_LENGTH) {
    return mode === "symbols" ? new Key(mode, randomSymbols(length).toString("hex")) : new Key(mode, randomText(length));
  }

  get chars() {
    return this.bytes.toString("latin1");
  }

  requireCipherKey() {
    if (this.bytes.length !== KEY_LENGTH) {
      throw new Error(`An encryption key must be ${KEY_LENGTH} bytes, this ${this.mode} key has ${this.bytes.length}`);
    }
    if (this.mode === "text" && !/^[\x21-\x7e]+$/.test(this.input)) {
      throw new Error("A text encryption key must use printable ASCII characters only");
    }
  }

  get serverText() {
    return this.input;
  }

  toJSON() {
    return { mode: this.mode, key: this.input };
  }
}
