export const DEFAULT_TRASH = { minDepth: 9, maxDepth: 14 };
export const DEPTH_LIMIT = 64;

function depth(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > DEPTH_LIMIT) {
    throw new Error(`${name} must be a whole number from 1 to ${DEPTH_LIMIT}`);
  }
  return number;
}

export function trashSettings(params) {
  if (!params.trashPaths) {
    return null;
  }
  const minDepth = depth(params.trashMinDepth ?? DEFAULT_TRASH.minDepth, "Trash min depth");
  const maxDepth = depth(params.trashMaxDepth ?? DEFAULT_TRASH.maxDepth, "Trash max depth");
  if (minDepth > maxDepth) {
    throw new Error("Trash min depth cannot be larger than max depth");
  }
  return { minDepth, maxDepth };
}
