export const FILE_EXTENSIONS = new Set([
  "png", "tga", "jpg", "jpeg", "hdr", "gif", "webp", "bmp", "svg", "psd", "pdn",
  "ogg", "fsb", "wav", "mp3",
  "json", "material", "lang", "fontdata", "ttf", "otf", "dat", "txt", "bin", "js",
]);

export function extensionOf(fileName) {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) {
    return "";
  }
  const extension = fileName.slice(dot + 1).toLowerCase();
  return FILE_EXTENSIONS.has(extension) ? extension : "";
}

export function stripExtension(path) {
  const slash = path.lastIndexOf("/");
  const fileName = path.slice(slash + 1);
  const extension = extensionOf(fileName);
  return extension === "" ? path : path.slice(0, path.length - extension.length - 1);
}
