"use client";

import { useLayoutEffect } from "react";
import { applyTheme, getStoredTheme } from "@id/ui";

export function ThemeInit() {
  useLayoutEffect(() => {
    applyTheme(getStoredTheme());
  }, []);
  return null;
}
