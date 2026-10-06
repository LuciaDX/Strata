import { Squircle } from "./Squircle.jsx";
import styles from "./Field.module.css";

export function Field({ multiline = false, active = false, className = "", children }) {
  return (
    <Squircle radius={multiline ? 18 : 19} className={[styles.field, active ? styles.active : "", className].join(" ")}>
      {children}
    </Squircle>
  );
}
