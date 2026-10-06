const listeners = new Set();
let current = null;

function emit() {
  for (const listener of listeners) {
    listener(current);
  }
}

export function subscribeTip(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showTip(target, content, side) {
  current = { target, content, side };
  emit();
}

export function hideTip(target) {
  if (!current || (target && current.target !== target)) {
    return;
  }
  current = null;
  emit();
}

export function tip(content, side = "top") {
  if (!content) {
    return {};
  }
  return {
    onPointerEnter: (event) => showTip(event.currentTarget, content, side),
    onPointerLeave: (event) => hideTip(event.currentTarget),
  };
}
