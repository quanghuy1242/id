// DaisyUI 5: https://daisyui.com/components/menu/
"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { MenuTrigger as AriaMenuTrigger, Popover } from "react-aria-components";
import { Avatar } from "../avatar";
import { Button } from "../button";
import { Menu, MenuItem } from "../menu";
import { NavIcon } from "../nav-icons";

type Gap = "xs" | "sm" | "md" | "lg";
type Align = "start" | "center" | "end" | "stretch";
type Width = "narrow" | "content" | "wide" | "full";
type Padding = "none" | "sm" | "md" | "lg";
type SurfaceTone = "base" | "muted";

type SurfaceProps = {
  readonly children: ReactNode;
};

type PageProps = SurfaceProps & {
  readonly layout?: "centered" | "dashboard";
};

const gapClass: Record<Gap, string> = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

const alignClass: Record<Align, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const widthClass: Record<Width, string> = {
  narrow: "max-w-md",
  content: "max-w-3xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

const paddingClass: Record<Padding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-6",
  lg: "p-8",
};

export function Page({ layout = "centered", children }: PageProps) {
  if (layout === "centered") {
    return (
      <main className="min-h-screen bg-base-200 text-base-content font-sans flex flex-col items-center justify-center p-4">
        <Container width="narrow">
          <Stack>
            {children}
          </Stack>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-200 text-base-content font-sans flex flex-col">
      {children}
    </main>
  );
}

type ContainerProps = SurfaceProps & {
  readonly width?: Width;
};

export function Container({ width = "wide", children }: ContainerProps) {
  return (
    <div className={`w-full ${widthClass[width]} mx-auto`}>
      {children}
    </div>
  );
}

type PageSectionProps = SurfaceProps & {
  readonly padding?: Padding;
};

export function PageSection({ padding = "md", children }: PageSectionProps) {
  return (
    <section className={`w-full ${paddingClass[padding]}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function PageHeader({ children }: SurfaceProps) {
  return (
    <header className="border-b border-base-300 bg-base-100 px-6 py-4 w-full">
      <Container>
        <div className="flex items-center justify-between">
          {children}
        </div>
      </Container>
    </header>
  );
}

export function PageBody({ children }: SurfaceProps) {
  return (
    <div className="flex-1 p-6 w-full">
      <Container>{children}</Container>
    </div>
  );
}

type PanelProps = SurfaceProps & {
  readonly tone?: SurfaceTone;
  readonly padding?: Padding;
};

export function Panel({ tone = "base", padding = "md", children }: PanelProps) {
  const toneClass = tone === "muted" ? "bg-base-200" : "bg-base-100";
  return (
    <section className={`card ${toneClass} border border-base-300 shadow-sm ${paddingClass[padding]} w-full`}>
      {children}
    </section>
  );
}

type StackProps = SurfaceProps & {
  readonly gap?: Gap;
  readonly align?: Align;
};

export function Stack({ gap = "md", align = "stretch", children }: StackProps) {
  return (
    <div className={`flex flex-col ${alignClass[align]} ${gapClass[gap]} w-full`}>
      {children}
    </div>
  );
}

type GridProps = SurfaceProps & {
  readonly columns?: "one" | "two" | "three";
  readonly gap?: Gap;
};

export function Grid({ columns = "one", gap = "md", children }: GridProps) {
  const columnsClass = {
    one: "grid-cols-1",
    two: "grid-cols-1 md:grid-cols-2",
    three: "grid-cols-1 md:grid-cols-3",
  }[columns];
  return <div className={`grid ${columnsClass} ${gapClass[gap]}`}>{children}</div>;
}

type ColumnsProps = SurfaceProps & {
  readonly gap?: Gap;
};

export function Columns({ gap = "md", children }: ColumnsProps) {
  return <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] ${gapClass[gap]}`}>{children}</div>;
}

type SpacerProps = {
  readonly size?: Gap;
};

export function Spacer({ size = "md" }: SpacerProps) {
  const sizeClass = {
    xs: "h-1",
    sm: "h-2",
    md: "h-4",
    lg: "h-6",
  }[size];
  return <div aria-hidden="true" className={sizeClass} />;
}

export function AppShell({ children }: SurfaceProps) {
  return <div className="h-screen overflow-hidden flex flex-col bg-base-200 text-base-content">{children}</div>;
}

export function Topbar({ children }: SurfaceProps) {
  return (
    <header className="navbar min-h-16 shrink-0 bg-base-100 border-b border-base-300 shadow-sm px-4 sm:px-6">
      {children}
    </header>
  );
}

export function TopbarStart({ children }: SurfaceProps) {
  return <div className="navbar-start flex-1 w-auto gap-2">{children}</div>;
}

export function TopbarEnd({ children }: SurfaceProps) {
  return <div className="navbar-end w-auto gap-2">{children}</div>;
}

export function Sidebar({ children }: SurfaceProps) {
  return (
    <aside className="hidden lg:block w-72 shrink-0 border-r border-base-300 bg-base-100 p-4 overflow-y-auto">
      {children}
    </aside>
  );
}

export function NavTitle({ children }: SurfaceProps) {
  return (
    <li>
      <h2 className="menu-title px-3 pt-4 pb-1">{children}</h2>
    </li>
  );
}

export function SidebarLayout({ children }: SurfaceProps) {
  return <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>;
}

export function MainContent({ children }: SurfaceProps) {
  return <main className="flex flex-col flex-1 min-h-0 overflow-y-auto">{children}</main>;
}

export function MobileRouteTabs({ children }: SurfaceProps) {
  return <div className="lg:hidden border-b border-base-300 bg-base-100 px-6">{children}</div>;
}

type MobileDockProps = SurfaceProps & {
  readonly ariaLabel?: string;
};

export function MobileDock({ ariaLabel = "Primary mobile navigation", children }: MobileDockProps) {
  return <nav aria-label={ariaLabel} className="dock bg-base-100 border-t border-base-300 lg:hidden">{children}</nav>;
}

type NavMenuProps = SurfaceProps & {
  readonly label?: string;
};

export function NavMenu({ label, children }: NavMenuProps) {
  return (
    <nav aria-label={label}>
      <ul className="menu w-full p-0">
        {children}
      </ul>
    </nav>
  );
}

type NavSectionProps = SurfaceProps & {
  readonly title?: string;
  readonly collapsible?: boolean;
};

export function NavSection({ title, collapsible = false, children }: NavSectionProps) {
  if (collapsible && title) {
    return (
      <li>
        <details open>
          <summary>{title}</summary>
          <ul>
            {children}
          </ul>
        </details>
      </li>
    );
  }

  return (
    <li>
      {title ? <h2 className="menu-title">{title}</h2> : null}
      <ul>
        {children}
      </ul>
    </li>
  );
}

type NavLinkProps = {
  readonly href: string;
  readonly active?: boolean;
  readonly current?: "page";
  readonly iconName?: string;
  readonly children: ReactNode;
};

export function NavLink({ href, active = false, current, iconName, children }: NavLinkProps) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current}
        className={active ? "menu-active" : undefined}
        style={active ? { backgroundColor: "var(--color-primary)", color: "var(--color-primary-content)" } : undefined}
      >
        {iconName ? <NavIcon name={iconName} variant="sidebar" /> : null}
        {children}
      </Link>
    </li>
  );
}

type DockLinkProps = {
  readonly href: string;
  readonly active?: boolean;
  readonly current?: "page";
  readonly label: string;
  readonly iconName?: string;
};

export function DockLink({ href, active = false, current, label, iconName }: DockLinkProps) {
  return (
    <Link href={href} aria-current={current} className={active ? "dock-active" : undefined}>
      {iconName
        ? <NavIcon name={iconName} variant="dock" />
        : <span className="size-[0.35rem] rounded-full bg-current opacity-70" aria-hidden="true" />
      }
      <span className="dock-label">{label}</span>
    </Link>
  );
}

type BrandLinkProps = {
  readonly href: string;
  readonly children: ReactNode;
};

export function TopbarBrandLink({ href, children }: BrandLinkProps) {
  return <Link href={href} className="btn btn-ghost text-xl font-semibold normal-case">{children}</Link>;
}

type TopbarBreadcrumbProps = {
  readonly items: readonly string[];
};

export function TopbarBreadcrumb({ items }: TopbarBreadcrumbProps) {
  return (
    <div className="breadcrumbs text-sm text-base-content/60">
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

type TopbarAvatarMenuItem = {
  readonly label: string;
  readonly badge?: string;
  readonly href?: string;
  readonly onAction?: () => void;
};

type TopbarAvatarMenuProps = {
  readonly ariaLabel?: string;
  readonly initials?: string;
  readonly items: readonly TopbarAvatarMenuItem[];
};

export function TopbarAvatarMenu({
  ariaLabel = "Open account menu",
  initials = "AD",
  items,
}: TopbarAvatarMenuProps) {
  return (
    <AriaMenuTrigger aria-label={ariaLabel}>
      <Button variant="ghost" size="sm" circle ariaLabel={ariaLabel}>
        <Avatar initials={initials} size="sm" />
      </Button>
      <Popover
        className="z-50 data-[entering]:animate-popover-in data-[exiting]:animate-popover-out"
        placement="bottom end"
        offset={4}
        crossOffset={0}
      >
        <Menu>
          {items.map((item) => (
            <MenuItem
              key={item.href ?? item.label}
              href={item.href}
              badge={item.badge}
              label={item.label}
              onAction={item.onAction}
            />
          ))}
        </Menu>
      </Popover>
    </AriaMenuTrigger>
  );
}
