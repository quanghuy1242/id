import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeInit } from "./_components/theme-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "id admin",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" data-theme="lumina-light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "(function () {",
              "  try {",
              "    var t = localStorage.getItem('lumina-theme');",
              "    if (t === 'dark') {",
              "      document.documentElement.setAttribute('data-theme', 'lumina-dark');",
              "      document.body.setAttribute('data-theme', 'lumina-dark');",
              "    } else if (t === 'light') {",
              "      document.documentElement.setAttribute('data-theme', 'lumina-light');",
              "      document.body.setAttribute('data-theme', 'lumina-light');",
              "    } else {",
              "      document.documentElement.removeAttribute('data-theme');",
              "      document.body.removeAttribute('data-theme');",
              "    }",
              "  } catch (e) {}",
              "})();",
            ].join("\n"),
          }}
        />
      </head>
      <body>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
