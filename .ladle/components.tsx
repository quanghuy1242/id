import { useLayoutEffect } from "react";
import { ThemeState, type GlobalProvider } from "@ladle/react";
import globalStylesHref from "../workers/ui/src/app/globals.css?url";

function getThemeName(theme: ThemeState): "lumina-light" | "lumina-dark" {
  return theme === ThemeState.Dark ? "lumina-dark" : "lumina-light";
}

export const Provider: GlobalProvider = ({ globalState, children }) => {
  const themeName = getThemeName(globalState.theme);

  // Set data-theme only on <body> for portal-rendered overlays (modals, popovers,
  // tooltips, toasts). Do NOT set on document.documentElement — Ladle's own theme
  // toggle writes "light"/"dark" there for its toolbar CSS, and our DaisyUI theme
  // names ("lumina-light"/"lumina-dark") would break Ladle's toolbar styling.
  useLayoutEffect(() => {
    document.body.setAttribute("data-theme", themeName);
  }, [themeName]);

  return (
    <>
      <link rel="stylesheet" href={globalStylesHref} />
      <div data-theme={themeName}>{children}</div>
    </>
  );
};
