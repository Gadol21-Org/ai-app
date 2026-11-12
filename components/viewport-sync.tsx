"use client";

import { useEffect } from "react";

/**
 * Pins the app shell to the visual viewport. iOS Safari doesn't resize the layout viewport
 * for the keyboard; it scrolls it so the focused input is visible, which pushed the header
 * away and then snapped back. We mirror the visual viewport's height and offset into CSS
 * variables on every resize/scroll event, so the fixed shell (`.app-shell`) follows it frame
 * by frame instead of jumping.
 */
export function ViewportSync() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
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
