import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hideTip, subscribeTip } from "../lib/tooltip.js";
import { Squircle } from "./Squircle.jsx";
import styles from "./Tooltip.module.css";

const DELAY = 450;
const WARM = 300;
const GAP = 8;
const MARGIN = 10;
const FLIP = { top: "bottom", bottom: "top", left: "right", right: "left" };

function placeAt(side, anchor, width, height) {
  if (side === "top") {
    return { left: anchor.left + anchor.width / 2 - width / 2, top: anchor.top - GAP - height };
  }
  if (side === "bottom") {
    return { left: anchor.left + anchor.width / 2 - width / 2, top: anchor.bottom + GAP };
  }
  if (side === "left") {
    return { left: anchor.left - GAP - width, top: anchor.top + anchor.height / 2 - height / 2 };
  }
  return { left: anchor.right + GAP, top: anchor.top + anchor.height / 2 - height / 2 };
}

function fits(place, width, height) {
  return place.left >= MARGIN && place.top >= MARGIN && place.left + width <= window.innerWidth - MARGIN && place.top + height <= window.innerHeight - MARGIN;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function TooltipLayer() {
  const ref = useRef(null);
  const timer = useRef(null);
  const lastHidden = useRef(0);
  const visible = useRef(false);
  const [shown, setShown] = useState(null);
  const [place, setPlace] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeTip((next) => {
      clearTimeout(timer.current);
      if (!next) {
        if (visible.current) {
          lastHidden.current = performance.now();
        }
        visible.current = false;
        setShown(null);
        return;
      }
      if (visible.current || performance.now() - lastHidden.current < WARM) {
        visible.current = true;
        setShown(next);
        return;
      }
      timer.current = setTimeout(() => {
        visible.current = true;
        setShown(next);
      }, DELAY);
    });
    function dismiss() {
      hideTip();
    }
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("wheel", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("blur", dismiss);
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("wheel", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    const check = setInterval(() => {
      if (!shown.target.isConnected) {
        hideTip();
      }
    }, 250);
    return () => clearInterval(check);
  }, [shown]);

  useLayoutEffect(() => {
    if (!shown || !ref.current) {
      setPlace(null);
      return;
    }
    const anchor = shown.target.getBoundingClientRect();
    const width = ref.current.offsetWidth;
    const height = ref.current.offsetHeight;
    let side = shown.side;
    let next = placeAt(side, anchor, width, height);
    if (!fits(next, width, height)) {
      const flipped = placeAt(FLIP[side], anchor, width, height);
      if (fits(flipped, width, height)) {
        side = FLIP[side];
        next = flipped;
      }
    }
    setPlace({
      side,
      left: clamp(next.left, MARGIN, window.innerWidth - MARGIN - width),
      top: clamp(next.top, MARGIN, window.innerHeight - MARGIN - height),
    });
  }, [shown]);

  if (!shown) {
    return null;
  }

  return createPortal(
    <div
      ref={ref}
      className={styles.layer}
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}
      role="tooltip"
    >
      {place && (
        <Squircle radius={14} shadow className={`${styles.tip} ${styles[place.side]}`}>
          <div className={styles.content}>{shown.content}</div>
        </Squircle>
      )}
      {!place && <div className={styles.content}>{shown.content}</div>}
    </div>,
    document.body,
  );
}
