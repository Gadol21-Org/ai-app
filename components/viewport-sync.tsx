"use client";

import { useEffect } from "react";

/**
 * Keeps `--app-height` equal to the visual viewport height so the on-screen keyboard
 * shrinks the app instead of pushing the whole page up (iOS Safari does not resize the
 * layout viewport for the keyboard). Also undoes the scroll offset iOS applies to the page
 * when it focuses an input, which is what hid the title bar.
 */
export function ViewportSync() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      if (window.scrollY !== 0 || vv.offsetTop !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
