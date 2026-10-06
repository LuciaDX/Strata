import { parseTree, printParseErrorCode } from "jsonc-parser";

export class RawNumber {
  constructor(raw) {
    this.raw = raw;
  }

  toString() {
    return this.raw;
  }
}

export function isObject(value) {
  return value instanceof Map;
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isString(value) {
  return typeof value === "string";
}

export function isPrimitive(value) {
  return typeof value === "string" || typeof value === "boolean" || value instanceof RawNumber;
}

export function asString(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof RawNumber || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function parseJson(input) {
  let text = typeof input === "string" ? input : Buffer.from(input).toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const errors = [];
  const tree = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0 || !tree) {
    const error = errors[0];
    const message = error ? `${printParseErrorCode(error.error)} at offset ${error.offset}` : "empty document";
    throw new Error(message);
  }
  return convertNode(tree, text);
}

function convertNode(node, text) {
  switch (node.type) {
    case "object": {
      const map = new Map();
      for (const property of node.children ?? []) {
        const [keyNode, valueNode] = property.children;
        map.set(keyNode.value, valueNode ? convertNode(valueNode, text) : null);
      }
      return map;
    }
    case "array":
      return (node.children ?? []).map((child) => convertNode(child, text));
    case "number":
      return new RawNumber(text.slice(node.offset, node.offset + node.length));
    default:
      return node.value;
  }
}

export function stringifyJson(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return quote(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value instanceof RawNumber) {
    return value.raw;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stringifyJson).join(",") + "]";
  }
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  const parts = [];
  for (const [key, child] of entries) {
    if (child === null || child === undefined) {
      continue;
    }
    parts.push(quote(key) + ":" + stringifyJson(child));
  }
  return "{" + parts.join(",") + "}";
}

const SHORT_ESCAPES = {
  "\"": "\\\"",
  "\\": "\\\\",
  "\t": "\\t",
  "\b": "\\b",
  "\n": "\\n",
  "\r": "\\r",
  "\f": "\\f",
};

function quote(text) {
  let result = "\"";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (SHORT_ESCAPES[char]) {
      result += SHORT_ESCAPES[char];
    } else if (code < 0x20 || code === 0x2028 || code === 0x2029) {
      result += "\\u" + code.toString(16).padStart(4, "0");
    } else {
      result += char;
    }
  }
  return result + "\"";
}

export function toPlain(value) {
  if (value instanceof RawNumber) {
    return Number(value.raw);
  }
  if (Array.isArray(value)) {
    return value.map(toPlain);
  }
  if (value instanceof Map) {
    const object = {};
    for (const [key, child] of value) {
      object[key] = toPlain(child);
    }
    return object;
  }
  return value;
}
