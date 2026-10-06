const SBOX = new Uint8Array(256);
const T0 = new Uint32Array(256);
const T1 = new Uint32Array(256);
const T2 = new Uint32Array(256);
const T3 = new Uint32Array(256);

function buildTables() {
  const double = new Uint8Array(256);
  const inverse = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    double[i] = (i << 1) ^ ((i >> 7) * 283);
    inverse[double[i] ^ i] = i;
  }
  let x2 = 0;
  for (let x = 0, xInv = 0; SBOX[x] === 0; x ^= x2 || 1, xInv = inverse[xInv] || 1) {
    let s = xInv ^ (xInv << 1) ^ (xInv << 2) ^ (xInv << 3) ^ (xInv << 4);
    s = (s >> 8) ^ (s & 255) ^ 99;
    SBOX[x] = s;
    x2 = double[x];
    let word = (double[s] * 0x101) ^ (s * 0x1010100);
    word = (word << 24) ^ (word >>> 8);
    T0[x] = word;
    word = (word << 24) ^ (word >>> 8);
    T1[x] = word;
    word = (word << 24) ^ (word >>> 8);
    T2[x] = word;
    word = (word << 24) ^ (word >>> 8);
    T3[x] = word;
  }
}

buildTables();

function expandKey(key) {
  if (key.length !== 32) {
    throw new Error("AES-256 needs a 32 byte key");
  }
  const words = new Uint32Array(60);
  for (let i = 0; i < 8; i++) {
    words[i] = key.readUInt32BE(i * 4);
  }
  let rcon = 1;
  for (let i = 8; i < 60; i++) {
    let tmp = words[i - 1];
    if (i % 8 === 0 || i % 8 === 4) {
      tmp = (SBOX[tmp >>> 24] << 24) ^ (SBOX[(tmp >> 16) & 255] << 16) ^ (SBOX[(tmp >> 8) & 255] << 8) ^ SBOX[tmp & 255];
      if (i % 8 === 0) {
        tmp = (tmp << 8) ^ (tmp >>> 24) ^ (rcon << 24);
        rcon = (rcon << 1) ^ ((rcon >> 7) * 283);
      }
    }
    words[i] = words[i - 8] ^ tmp;
  }
  return words;
}

export function cfb8(data, key, iv, decrypt) {
  const k = expandKey(key);
  const output = Buffer.allocUnsafe(data.length);
  let r0 = iv.readUInt32BE(0);
  let r1 = iv.readUInt32BE(4);
  let r2 = iv.readUInt32BE(8);
  let r3 = iv.readUInt32BE(12);

  for (let i = 0; i < data.length; i++) {
    let a = r0 ^ k[0];
    let b = r1 ^ k[1];
    let c = r2 ^ k[2];
    let d = r3 ^ k[3];
    let index = 4;
    for (let round = 0; round < 13; round++) {
      const a2 = T0[a >>> 24] ^ T1[(b >> 16) & 255] ^ T2[(c >> 8) & 255] ^ T3[d & 255] ^ k[index];
      const b2 = T0[b >>> 24] ^ T1[(c >> 16) & 255] ^ T2[(d >> 8) & 255] ^ T3[a & 255] ^ k[index + 1];
      const c2 = T0[c >>> 24] ^ T1[(d >> 16) & 255] ^ T2[(a >> 8) & 255] ^ T3[b & 255] ^ k[index + 2];
      d = T0[d >>> 24] ^ T1[(a >> 16) & 255] ^ T2[(b >> 8) & 255] ^ T3[c & 255] ^ k[index + 3];
      a = a2;
      b = b2;
      c = c2;
      index += 4;
    }
    const pad = SBOX[a >>> 24] ^ (k[index] >>> 24);
    const input = data[i];
    const result = input ^ pad;
    output[i] = result;
    const fed = decrypt ? input : result;
    r0 = ((r0 << 8) | (r1 >>> 24)) >>> 0;
    r1 = ((r1 << 8) | (r2 >>> 24)) >>> 0;
    r2 = ((r2 << 8) | (r3 >>> 24)) >>> 0;
    r3 = ((r3 << 8) | fed) >>> 0;
  }
  return output;
}
