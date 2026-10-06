const MAGIC = 0x267052a0b125277dn;
export const ARCHIVE_PREFIX = "__brarchive/";
export const ARCHIVE_SUFFIX = ".brarchive";
const VERSION = 1;
const DESCRIPTOR_SIZE = 256;
const NAME_MAX = 247;

export function archivePath(folder) {
  return ARCHIVE_PREFIX + folder + ARCHIVE_SUFFIX;
}

export function archiveFolder(path) {
  if (!path.startsWith(ARCHIVE_PREFIX) || !path.endsWith(ARCHIVE_SUFFIX)) {
    return null;
  }
  return path.slice(ARCHIVE_PREFIX.length, -ARCHIVE_SUFFIX.length);
}

export function isBrarchive(data) {
  return data.length >= 16 && data.readBigUInt64LE(0) === MAGIC;
}

export function readBrarchive(data) {
  if (!isBrarchive(data)) {
    throw new Error("Not a brarchive");
  }
  const count = data.readUInt32LE(8);
  const version = data.readUInt32LE(12);
  if (version !== VERSION) {
    throw new Error(`Unsupported brarchive version ${version}`);
  }
  const contentBase = 16 + count * DESCRIPTOR_SIZE;
  if (contentBase > data.length) {
    throw new Error("Truncated brarchive");
  }
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const descriptor = 16 + i * DESCRIPTOR_SIZE;
    const nameLength = data[descriptor];
    if (nameLength > NAME_MAX) {
      throw new Error(`Entry ${i} name is too long`);
    }
    const name = data.toString("utf8", descriptor + 1, descriptor + 1 + nameLength);
    const offset = data.readUInt32LE(descriptor + 248);
    const length = data.readUInt32LE(descriptor + 252);
    const start = contentBase + offset;
    if (start + length > data.length) {
      throw new Error(`Entry ${name} is out of bounds`);
    }
    entries.set(name, data.subarray(start, start + length));
  }
  return entries;
}

export function writeBrarchive(entries) {
  const names = [...entries.keys()];
  const header = Buffer.alloc(16 + names.length * DESCRIPTOR_SIZE);
  header.writeBigUInt64LE(MAGIC, 0);
  header.writeUInt32LE(names.length, 8);
  header.writeUInt32LE(VERSION, 12);
  const contents = [];
  let offset = 0;
  names.forEach((name, i) => {
    const nameBytes = Buffer.from(name, "utf8");
    if (nameBytes.length > NAME_MAX) {
      throw new Error(`Entry name is too long: ${name}`);
    }
    const data = Buffer.from(entries.get(name));
    const descriptor = 16 + i * DESCRIPTOR_SIZE;
    header[descriptor] = nameBytes.length;
    nameBytes.copy(header, descriptor + 1);
    header.writeUInt32LE(offset, descriptor + 248);
    header.writeUInt32LE(data.length, descriptor + 252);
    contents.push(data);
    offset += data.length;
  });
  return Buffer.concat([header, ...contents]);
}
