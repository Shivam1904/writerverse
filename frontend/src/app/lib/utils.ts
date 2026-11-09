import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A11y props for a non-<button> element acting as a button. Spreads role +
 * tabIndex + onClick + keyboard activation (Enter/Space) so it's reachable and
 * operable by keyboard, not just mouse. Returns {} when there's no handler (the
 * element is inert and shouldn't be focusable). Use on clickable divs/spans
 * where a real <button> would fight the layout. */
export function clickableProps(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: any) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}
