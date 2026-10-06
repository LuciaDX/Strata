import { useId } from "react";

export function Logo({ size = 24, className }) {
  const gradient = `logo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} width={size} height={size} viewBox="8 8 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffa1ab" />
          <stop offset="0.45" stopColor="#ff5266" />
          <stop offset="1" stopColor="#f0384b" />
        </linearGradient>
      </defs>
      <rect x="10" y="13" width="44" height="10" rx="5" fill={`url(#${gradient})`} />
      <rect x="20" y="27" width="34" height="10" rx="5" fill="#ff5266" opacity="0.7" />
      <rect x="10" y="41" width="28" height="10" rx="5" fill="#ff5266" opacity="0.42" />
    </svg>
  );
}
