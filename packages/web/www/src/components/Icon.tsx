import { ICONS, type IconName } from "./icons.generated.ts";

/** An icon drawn inline: sized by the font size of its container and coloured by `currentColor`. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`i ${className}`}
      viewBox={name === "github" ? "0 0 24 24" : "0 -960 960 960"}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
