let shared = {};

export function initialize(data) {
  shared = data ?? {};
}

export async function resolve(specifier, context, nextResolve) {
  const url = shared[specifier];
  if (url) {
    return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
