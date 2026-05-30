export const themeName = "lumina";

export type ThemeMode = "system" | "light" | "dark";

const storageKey = "lumina-theme";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(storageKey);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
  } else {
    const value = mode === "light" ? "lumina-light" : "lumina-dark";
    document.documentElement.setAttribute("data-theme", value);
    document.body.setAttribute("data-theme", value);
  }
  localStorage.setItem(storageKey, mode);
}

export function getActiveThemeName(): string {
  if (typeof document === "undefined") return "lumina-light";
  const bodyTheme = document.body.getAttribute("data-theme");
  if (bodyTheme === "lumina-light" || bodyTheme === "lumina-dark") return bodyTheme;
  const docTheme = document.documentElement.getAttribute("data-theme");
  if (docTheme === "lumina-light" || docTheme === "lumina-dark") return docTheme;
  return systemPrefersDark() ? "lumina-dark" : "lumina-light";
}
