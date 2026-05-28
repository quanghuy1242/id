import { useEffect } from "react";
import { ThemeState, type GlobalProvider } from "@ladle/react";
import globalStylesHref from "../workers/ui/src/app/globals.css?url";

function getThemeName(theme: ThemeState): "lumina-light" | "lumina-dark" {
  return theme === ThemeState.Dark ? "lumina-dark" : "lumina-light";
}

export const Provider: GlobalProvider = ({ globalState, children }) => {
  const themeName = getThemeName(globalState.theme);

  // React Aria portals render on <body>, outside the wrapper div.
  // Setting data-theme on both document roots ensures portals inherit theme tokens.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeName);
    document.body.setAttribute("data-theme", themeName);
  }, [themeName]);

  return (
    <>
      <link rel="stylesheet" href={globalStylesHref} />
      <div data-theme={themeName}>{children}</div>
    </>
  );
};
