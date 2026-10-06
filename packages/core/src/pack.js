export class Pack {
  constructor(files = new Map(), meta = {}) {
    this.files = files;
    this.meta = meta;
  }

  clone() {
    return new Pack(new Map(this.files), { ...this.meta });
  }

  has(path) {
    return this.files.has(path);
  }

  get(path) {
    return this.files.get(path);
  }

  set(path, data) {
    this.files.set(path, Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  delete(path) {
    this.files.delete(path);
  }

  paths() {
    return [...this.files.keys()];
  }

  get size() {
    return this.files.size;
  }
}
