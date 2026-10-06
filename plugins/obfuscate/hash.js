import { createHmac } from "node:crypto";

const DIGIT_LETTERS = "qrstuvwxyz";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";

export const HASH_ALGORITHMS = { md5: 16, sha256: 32 };
export const HASH_STYLES = ["letters", "hex", "lowercase"];
export const DEFAULT_HASH = { algorithm: "md5", style: "letters", length: 10, prefix: "" };

export function maxHashLength(algorithm, style) {
  const bytes = HASH_ALGORITHMS[algorithm];
  return style === "lowercase" ? bytes : bytes * 2;
}

function encode(digest, style, length) {
  if (style === "lowercase") {
    return [...digest.subarray(0, length)].map((byte) => LOWERCASE[byte % LOWERCASE.length]).join("");
  }
  const hex = digest.toString("hex").slice(0, length);
  return style === "hex" ? hex : hex.replace(/[0-9]/g, (digit) => DIGIT_LETTERS[digit]);
}

export function createHasher(key, format = DEFAULT_HASH) {
  const { algorithm, style, length, prefix } = { ...DEFAULT_HASH, ...format };
  const secret = Buffer.isBuffer(key) ? key : Buffer.from(key, "utf8");
  const cache = new Map();
  return function hash(input) {
    let result = cache.get(input);
    if (result === undefined) {
      result = prefix + encode(createHmac(algorithm, secret).update(input, "utf8").digest(), style, length);
      cache.set(input, result);
    }
    return result;
  };
}
