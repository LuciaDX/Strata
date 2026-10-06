const KEY_LENGTH = 32;
const TEXT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateKey(mode) {
  if (mode === "symbols") {
    return [...randomBytes(KEY_LENGTH)].map((byte) => (1 + (byte % 255)).toString(16).padStart(2, "0")).join("");
  }
  return [...randomBytes(KEY_LENGTH)].map((byte) => TEXT_CHARACTERS[byte % TEXT_CHARACTERS.length]).join("");
}

export function describeKey(mode, value) {
  if (!value) {
    return { valid: false, text: "Type a key or generate one" };
  }
  if (mode === "symbols") {
    const hex = value.replace(/\s+/g, "");
    if (!/^([0-9a-fA-F]{2})+$/.test(hex)) {
      return { valid: false, text: "Write symbols as hex, two characters per byte" };
    }
    if (/^(?:[0-9a-fA-F]{2})*00/.test(hex)) {
      return { valid: false, text: "The byte 00 is not allowed" };
    }
    const bytes = hex.length / 2;
    return { valid: true, text: bytes === KEY_LENGTH ? `${bytes} bytes, works for hashing and encryption` : `${bytes} bytes, encryption needs ${KEY_LENGTH}` };
  }
  const bytes = new TextEncoder().encode(value).length;
  const ascii = /^[\x21-\x7e]+$/.test(value);
  if (bytes === KEY_LENGTH && ascii) {
    return { valid: true, text: `${bytes} characters, works for hashing and encryption` };
  }
  return { valid: true, text: ascii ? `${bytes} characters, encryption needs ${KEY_LENGTH}` : "Hashing only, encryption needs printable ASCII" };
}
