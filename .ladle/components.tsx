import { ThemeState, type GlobalProvider } from "@ladle/react";
import globalStylesHref from "../workers/ui/src/app/globals.css?url";

function getThemeName(theme: ThemeState): "lumina-light" | "lumina-dark" {
  return theme === ThemeState.Dark ? "lumina-dark" : "lumina-light";
}

export const Provider: GlobalProvider = ({ globalState, children }) => (
  <>
    <link rel="stylesheet" href={globalStylesHref} />
    <div data-theme={getThemeName(globalState.theme)}>{children}</div>
  </>
);
