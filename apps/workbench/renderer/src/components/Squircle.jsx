import { useId, useLayoutEffect, useRef, useState } from "react";
import { getSvgPath } from "../lib/squircle.js";
import styles from "./Squircle.module.css";

export function Squircle({ as: Tag = "div", radius, smoothing = 1, shadow = false, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);
  const gradient = `edge${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useLayoutEffect(() => {
    const element = ref.current;

    function measure() {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      setSize((current) => (current && current.width === width && current.height === height ? current : { width, height }));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const path = size && size.width > 0 && size.height > 0 ? getSvgPath({ width: size.width, height: size.height, cornerRadius: radius, cornerSmoothing: smoothing }) : null;

  return (
    <Tag ref={ref} className={`${styles.squircle} ${className}`} {...rest}>
      {path && shadow && (
        <svg className={styles.shadow} width={size.width} height={size.height} aria-hidden="true">
          <path d={path} />
        </svg>
      )}
      {path && (
        <svg className={styles.back} width={size.width} height={size.height} aria-hidden="true">
          <path className={styles.ring} d={path} />
        </svg>
      )}
      <span className={styles.surface} style={path ? { clipPath: `path("${path}")`, borderRadius: 0 } : { borderRadius: radius }}>
        {path && (
          <svg className={styles.edge} width={size.width} height={size.height} aria-hidden="true">
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0.24" />
                <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.06" />
                <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.03" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0.14" />
              </linearGradient>
            </defs>
            <path className={styles.highlight} d={path} stroke={`url(#${gradient})`} />
            <path className={styles.border} d={path} />
          </svg>
        )}
      </span>
      {children}
    </Tag>
  );
}
