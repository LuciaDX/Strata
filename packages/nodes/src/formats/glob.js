function compile(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      const slash = pattern[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "i");
}

export function globMatcher(patterns) {
  const rules = (Array.isArray(patterns) ? patterns : [])
    .map((pattern) => String(pattern).trim().replace(/\\/g, "/").replace(/^\.?\//, ""))
    .filter(Boolean)
    .map((pattern) => ({ regex: compile(pattern), byName: !pattern.includes("/") }));
  if (rules.length === 0) {
    return () => false;
  }
  return (path) => {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return rules.some((rule) => rule.regex.test(rule.byName ? name : path));
  };
}
