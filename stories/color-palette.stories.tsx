import type { Story } from "@ladle/react";
import { Text, Stack, Inline, Button, Badge, Alert, Panel } from "@idco/ui";

type ThemeKey = "light" | "dark";

interface SwatchDef {
  name: string;
  bg: string;
  fg: string;
  hex: Record<ThemeKey, string>;
}

interface SwatchGroup {
  title: string;
  items: SwatchDef[];
}

const GROUPS: SwatchGroup[] = [
  {
    title: "Surfaces & text",
    items: [
      { name: "base-100", bg: "bg-base-100", fg: "text-base-content", hex: { light: "#f9fbfc", dark: "#182530" } },
      { name: "base-200", bg: "bg-base-200", fg: "text-base-content", hex: { light: "#eaf0f3", dark: "#0f1a22" } },
      { name: "base-300", bg: "bg-base-300", fg: "text-base-content", hex: { light: "#d3dde3", dark: "#2a3a45" } },
      { name: "base-content", bg: "bg-base-content", fg: "text-base-100", hex: { light: "#18272f", dark: "#e4edf1" } },
    ],
  },
  {
    title: "Brand",
    items: [
      { name: "primary", bg: "bg-primary", fg: "text-primary-content", hex: { light: "#3a5a6b", dark: "#6fa6c0" } },
      { name: "secondary", bg: "bg-secondary", fg: "text-secondary-content", hex: { light: "#557082", dark: "#8aa6b4" } },
      { name: "accent", bg: "bg-accent", fg: "text-accent-content", hex: { light: "#b65f34", dark: "#e08a55" } },
      { name: "neutral", bg: "bg-neutral", fg: "text-neutral-content", hex: { light: "#233640", dark: "#e4edf1" } },
    ],
  },
  {
    title: "Status",
    items: [
      { name: "info", bg: "bg-info", fg: "text-info-content", hex: { light: "#2f7fb0", dark: "#5aa6d6" } },
      { name: "success", bg: "bg-success", fg: "text-success-content", hex: { light: "#2f9e75", dark: "#3fbf8d" } },
      { name: "warning", bg: "bg-warning", fg: "text-warning-content", hex: { light: "#d39a36", dark: "#e6b357" } },
      { name: "error", bg: "bg-error", fg: "text-error-content", hex: { light: "#cf5454", dark: "#e87e79" } },
    ],
  },
];

function Swatch({ item, theme }: { item: SwatchDef; theme: ThemeKey }) {
  return (
    <div>
      <div className={`h-16 rounded-box border border-base-300 flex items-end p-2 ${item.bg} ${item.fg}`}>
        <span className="text-sm font-semibold">Aa</span>
      </div>
      <div className="mt-1.5 leading-tight">
        <div className="text-xs font-medium text-base-content">{item.name}</div>
        <div className="font-mono text-xs text-base-content/60">{item.hex[theme]}</div>
      </div>
    </div>
  );
}

function ThemePanel({ theme }: { theme: ThemeKey }) {
  const themeName = theme === "light" ? "idco-light" : "idco-dark";
  const subtitle = theme === "light" ? "Default theme" : "prefers-color-scheme: dark";
  return (
    <div data-theme={themeName} className="rounded-box border border-base-300 bg-base-200 text-base-content p-6">
      <Stack gap="md">
        <div>
          <Text variant="h3">{themeName}</Text>
          <Text variant="caption">{subtitle}</Text>
        </div>

        {GROUPS.map((group) => (
          <Stack key={group.title} gap="sm">
            <Text variant="caption">{group.title}</Text>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {group.items.map((item) => (
                <Swatch key={item.name} item={item} theme={theme} />
              ))}
            </div>
          </Stack>
        ))}

        <Stack gap="sm">
          <Text variant="caption">In context</Text>
          <Inline gap="sm" wrap>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
          </Inline>
          <Inline gap="sm" wrap>
            <Badge tone="primary">primary</Badge>
            <Badge tone="secondary">secondary</Badge>
            <Badge tone="accent">accent</Badge>
            <Badge tone="neutral">neutral</Badge>
            <Badge tone="info">info</Badge>
            <Badge tone="success">success</Badge>
            <Badge tone="warning">warning</Badge>
            <Badge tone="error">error</Badge>
          </Inline>
          <Panel>
            <Stack gap="sm">
              <Text variant="h3">Card on base-100</Text>
              <Text variant="body">
                Body copy in base-content over a base-100 surface, framed by the cool base-200 page field — the
                tinted neutrals are what keep the UI from reading as flat white.
              </Text>
              <Alert tone="info">Informational message uses the harmonised info tone.</Alert>
            </Stack>
          </Panel>
        </Stack>
      </Stack>
    </div>
  );
}

export const Palette: Story = () => (
  <div className="p-6">
    <Stack gap="lg">
      <div data-theme="idco-light" className="rounded-box bg-base-100 p-4">
        <Text variant="h2">idco color system</Text>
        <Text variant="body">
          Anchored on the brand petrol #3a5a6b. Both themes shown below so you can compare light and dark at a glance.
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ThemePanel theme="light" />
        <ThemePanel theme="dark" />
      </div>
    </Stack>
  </div>
);

export const Light: Story = () => (
  <div className="p-6">
    <ThemePanel theme="light" />
  </div>
);

export const Dark: Story = () => (
  <div className="p-6">
    <ThemePanel theme="dark" />
  </div>
);
