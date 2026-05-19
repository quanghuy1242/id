import { createElement, type CSSProperties, type ReactNode } from "react";

type SurfaceProps = {
  readonly children: ReactNode;
};

const pageStyle = {
  minHeight: "100vh",
  margin: 0,
  background: "#f7f8fa",
  color: "#17202a",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
} satisfies CSSProperties;

const pageHeaderStyle = {
  borderBottom: "1px solid #d8dee6",
  background: "#ffffff",
  padding: "24px",
} satisfies CSSProperties;

const pageBodyStyle = {
  padding: "24px",
} satisfies CSSProperties;

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #d8dee6",
  borderRadius: "8px",
  padding: "16px",
} satisfies CSSProperties;

const stackStyle = {
  display: "grid",
  gap: "12px",
} satisfies CSSProperties;

export function Page({ children }: SurfaceProps) {
  return createElement("main", { style: pageStyle }, children);
}

export function PageHeader({ children }: SurfaceProps) {
  return createElement("header", { style: pageHeaderStyle }, children);
}

export function PageBody({ children }: SurfaceProps) {
  return createElement("div", { style: pageBodyStyle }, children);
}

export function Panel({ children }: SurfaceProps) {
  return createElement("section", { style: panelStyle }, children);
}

export function Stack({ children }: SurfaceProps) {
  return createElement("div", { style: stackStyle }, children);
}
