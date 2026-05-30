import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "id admin",
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const cookieStore = await cookies();
  const themePref = cookieStore.get("lumina-theme")?.value;
  const dataTheme =
    themePref === "light" ? "lumina-light" : themePref === "dark" ? "lumina-dark" : undefined;

  return (
    <html lang="en" suppressHydrationWarning {...(dataTheme ? { "data-theme": dataTheme } : {})}>
      <body>{children}</body>
    </html>
  );
}
