export const PATH_STATES = {
  ok: "ok",
  missing: "missing",
  foreign: "foreign",
};

function parsePath(path) {
  const normalized = path.replaceAll("\\", "/");
  let root = "";
  let rest = normalized;
  const drive = /^([a-zA-Z]:)(\/|$)/.exec(normalized);
  if (drive) {
    root = drive[1].toUpperCase();
    rest = normalized.slice(2);
  } else if (normalized.startsWith("//")) {
    const [server = "", share = "", ...tail] = normalized.slice(2).split("/");
    root = `//${server}/${share}`;
    rest = tail.join("/");
  } else if (normalized.startsWith("/")) {
    root = "/";
  }
  const segments = [];
  for (const part of rest.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === ".." && segments.length > 0 && segments.at(-1) !== "..") {
      segments.pop();
    } else if (part !== ".." || root === "") {
      segments.push(part);
    }
  }
  return { root, segments, windows: root !== "" && root !== "/" };
}

function formatPath({ root, segments, windows }) {
  const separator = windows ? "\\" : "/";
  const body = segments.join(separator);
  if (root === "") {
    return body === "" ? "." : body;
  }
  if (root === "/") {
    return `/${body}`;
  }
  return `${root.replaceAll("/", separator)}${separator}${body}`;
}

function samePart(a, b, windows) {
  return windows ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function startsWith(path, prefix) {
  if (!samePart(path.root, prefix.root, prefix.windows) || path.segments.length < prefix.segments.length) {
    return false;
  }
  return prefix.segments.every((segment, index) => samePart(path.segments[index], segment, prefix.windows));
}

export function isAbsolutePath(path) {
  return parsePath(path).root !== "";
}

export function isForeignPath(path, platform) {
  const { root } = parsePath(path);
  if (root === "") {
    return false;
  }
  return platform === "win32" ? root === "/" : root !== "/";
}

export function portablePath(path) {
  return isAbsolutePath(path) ? path : formatPath(parsePath(path));
}

export function joinPath(base, path) {
  return isAbsolutePath(path) || !base ? portablePath(path) : formatPath(parsePath(`${base}/${path}`));
}

export function relativePath(base, path, maxUp = Infinity) {
  const from = parsePath(base);
  const to = parsePath(path);
  if (from.root === "" || to.root === "" || !samePart(from.root, to.root, to.windows)) {
    return null;
  }
  let common = 0;
  while (common < from.segments.length && common < to.segments.length && samePart(from.segments[common], to.segments[common], to.windows)) {
    common++;
  }
  const up = from.segments.length - common;
  if (up > maxUp) {
    return null;
  }
  const segments = [...Array(up).fill(".."), ...to.segments.slice(common)];
  return segments.length === 0 ? "." : segments.join("/");
}

export function isInside(base, path) {
  const relative = relativePath(base, path, 0);
  return relative !== null && relative !== ".";
}

export function relinkRule(oldPath, newPath) {
  const from = parsePath(oldPath);
  const to = parsePath(newPath);
  const windows = from.windows || to.windows;
  let shared = 0;
  while (
    shared < from.segments.length - 1 &&
    shared < to.segments.length - 1 &&
    samePart(from.segments.at(-1 - shared), to.segments.at(-1 - shared), windows)
  ) {
    shared++;
  }
  const keep = (parsed) => ({ ...parsed, segments: parsed.segments.slice(0, parsed.segments.length - shared) });
  return { from: keep(from), to: keep(to) };
}

export function describeRule(rule) {
  return { from: formatPath(rule.from), to: formatPath(rule.to) };
}

export function applyRelink(rule, path) {
  const target = parsePath(path);
  if (rule.from.segments.length === 0 || !startsWith(target, rule.from)) {
    return null;
  }
  return formatPath({ ...rule.to, segments: [...rule.to.segments, ...target.segments.slice(rule.from.segments.length)] });
}
