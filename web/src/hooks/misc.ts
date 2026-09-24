import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { THEME_KEY, safeSet } from "../lib/storage";

export function useNow(interval = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    safeSet(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#0d0d0c" : "#f6f4ef");
  }, [theme]);

  // circular reveal from the point of interaction
  const toggle = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!doc.startViewTransition || reduce) {
        setTheme(next);
        return;
      }
      const x = origin?.x ?? innerWidth - 40;
      const y = origin?.y ?? 40;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = doc.startViewTransition(() => {
        flushSync(() => setTheme(next));
        document.documentElement.dataset.theme = next;
      });
      vt.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 650, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
    },
    [theme]
  );

  return { theme, toggle };
}
