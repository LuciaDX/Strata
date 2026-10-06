import { crc32, deflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const STORE = 0;
const DEFLATE = 8;
const UTF8_NAMES = 0x0800;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

export function writeZip(entries, options = {}) {
  const level = options.level ?? 9;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [path, value] of entries) {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const name = Buffer.from(path, "utf8");
    const checksum = crc32(data);
    const deflated = level > 0 ? deflateRawSync(data, { level }) : null;
    const compressed = deflated && deflated.length < data.length;
    const body = compressed ? deflated : data;
    const method = compressed ? DEFLATE : STORE;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  if (entries.size > 0xffff || offset > 0xffffffff) {
    throw new Error("The pack is too large for a zip without ZIP64");
  }
  return Buffer.concat([...locals, ...centrals, end]);
}
