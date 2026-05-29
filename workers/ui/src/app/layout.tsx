import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "id admin",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" data-theme="lumina-light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "(function () {",
              "  try {",
              "    var t = localStorage.getItem('lumina-theme');",
              "    if (t === 'dark') {",
              "      document.documentElement.setAttribute('data-theme', 'lumina-dark');",
              "    } else if (t === 'system') {",
              "      document.documentElement.removeAttribute('data-theme');",
              "    }",
              "  } catch (e) {}",
              "})();",
            ].join("\n"),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
