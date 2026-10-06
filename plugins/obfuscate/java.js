const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;

export function javaStringHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  }
  return hash;
}

export class JavaRandom {
  constructor(seed) {
    this.seed = (BigInt(seed) ^ MULTIPLIER) & MASK;
  }

  next(bits) {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }

  nextInt(bound) {
    let r = this.next(31);
    const m = bound - 1;
    if ((bound & m) === 0) {
      return Number((BigInt(bound) * BigInt(r)) >> 31n);
    }
    for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = this.next(31)) {
      continue;
    }
    return r;
  }
}

export function javaSplit(text, separator) {
  if (text === "") {
    return [""];
  }
  const parts = text.split(separator);
  while (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}
