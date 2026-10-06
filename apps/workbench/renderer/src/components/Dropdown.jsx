import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "./Field.jsx";
import { Icon } from "./Icon.jsx";
import { Squircle } from "./Squircle.jsx";
import styles from "./Dropdown.module.css";

const OPTION_HEIGHT = 34;
const MENU_PADDING = 6;
const GAP = 6;

function normalize(options) {
  return options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
}

function Chevron({ open }) {
  return <Icon name="chevron-down" size={12} className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron} />;
}

function Check() {
  return <Icon name="check" size={12} className={styles.check} />;
}

export function Dropdown({ value, options, placeholder = "Choose", onChange }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const [active, setActive] = useState(0);
  const items = normalize(options);
  const selected = items.findIndex((item) => item.value === value);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const height = items.length * OPTION_HEIGHT + MENU_PADDING * 2;
    const below = window.innerHeight - rect.bottom;
    const up = below < height + GAP * 2 && rect.top > below;
    setPlace({
      left: rect.left,
      width: rect.width,
      top: up ? rect.top - GAP - height : rect.bottom + GAP,
      up,
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function onPointer(event) {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onScroll(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function show() {
    setActive(Math.max(0, selected));
    setOpen(true);
  }

  function choose(item) {
    onChange(item.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <>
      <Field active={open}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onKeyDown}
        >
          <span className={selected === -1 ? `${styles.value} ${styles.placeholder}` : styles.value}>{selected === -1 ? placeholder : items[selected].label}</span>
          <Chevron open={open} />
        </button>
      </Field>
      {open &&
        place &&
        createPortal(
          <div ref={menuRef} className={styles.layer} style={{ left: place.left, top: place.top, width: place.width }}>
            <Squircle radius={18} shadow className={place.up ? `${styles.menu} ${styles.up}` : styles.menu}>
              <div role="listbox" className={styles.options}>
                {items.map((item, index) => (
                  <div
                    key={item.value}
                    role="option"
                    aria-selected={index === selected}
                    className={[styles.option, index === active ? styles.active : "", index === selected ? styles.selected : ""].join(" ")}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => choose(item)}
                  >
                    <span className={styles.label}>{item.label}</span>
                    {index === selected && <Check />}
                  </div>
                ))}
              </div>
            </Squircle>
          </div>,
          document.body,
        )}
    </>
  );
}
