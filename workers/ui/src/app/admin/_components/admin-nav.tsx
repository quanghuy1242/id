"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Button,
  DockLink,
  MobileRouteTabs,
  NavLink,
  NavMenu,
  NavSection,
  Tabs,
  ThemeDialog,
  TopbarAvatarMenu,
  TopbarBrandLink,
  TopbarEnd,
  TopbarStart,
  ResponsiveBreadcrumb,
} from "@id/ui";
import { ADMIN_LOGIN_REDIRECT_URL, MOBILE_NAV, SIDEBAR_NAV } from "@/shared/constants";
import { signOut } from "../_actions/users";

type SidebarItem = { label: string; href: string; exact?: boolean; icon?: string };

type SidebarGroup = {
  title: string | null;
  items: SidebarItem[];
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function getBestActiveItem<TItem extends SidebarItem>(
  pathname: string,
  items: readonly TItem[],
): TItem | undefined {
  let bestItem: TItem | undefined;
  let bestScore = -1;

  for (const item of items) {
    if (!isActive(pathname, item.href, item.exact)) continue;

    const score = item.href.length;
    if (score > bestScore) {
      bestItem = item;
      bestScore = score;
    }
  }

  return bestItem;
}

function getCurrentPageLabel(pathname: string): string {
  const { groups, topLevelItems } = getSidebarNavGroups();
  const activeEntry = getBestActiveItem(
    pathname,
    [...topLevelItems, ...groups.flatMap((group) => group.items)],
  );
  return activeEntry?.label ?? "Dashboard";
}

function getSidebarNavGroups(): { groups: SidebarGroup[]; topLevelItems: SidebarItem[] } {
  const groups: SidebarGroup[] = [];
  const topLevelItems: SidebarItem[] = [];

  for (const entry of SIDEBAR_NAV) {
    if (entry.type === "section") {
      groups.push({ title: entry.label, items: [] });
      continue;
    }

    if (groups.length === 0) {
      topLevelItems.push(entry);
      continue;
    }

    groups[groups.length - 1].items.push(entry);
  }

  return { groups, topLevelItems };
}

function getSectionPrefix(href: string): string {
  const [, adminSegment, sectionSegment] = href.split("/");
  return `/${adminSegment}/${sectionSegment}`;
}

function getMobileRouteTabs(pathname: string): { group: SidebarGroup; selectedKey: string } | null {
  const { groups } = getSidebarNavGroups();
  const activeGroup = groups.find((group) => {
    const firstItem = group.items[0];
    if (!firstItem) return false;
    return isActive(pathname, getSectionPrefix(firstItem.href));
  });

  if (!activeGroup || activeGroup.items.length < 2) return null;

  const selectedItem = getBestActiveItem(pathname, activeGroup.items) ?? activeGroup.items[0];

  return { group: activeGroup, selectedKey: selectedItem.href };
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  const { groups, topLevelItems } = getSidebarNavGroups();
  const activeItem = getBestActiveItem(
    pathname,
    [...topLevelItems, ...groups.flatMap((group) => group.items)],
  );

  return (
    <NavMenu label="Admin sidebar navigation">
      {topLevelItems.map((entry) => {
        const active = activeItem?.href === entry.href;
        return (
          <NavLink
            key={entry.href}
            href={entry.href}
            active={active}
            current={active ? "page" : undefined}
            iconName={entry.icon}
          >
            {entry.label}
          </NavLink>
        );
      })}
      {groups.map((group, groupIndex) => (
        <NavSection
          key={group.title ?? `root-${groupIndex}`}
          title={group.title ?? undefined}
          collapsible
        >
          {group.items.map((entry) => {
            const active = activeItem?.href === entry.href;
            return (
              <NavLink
                key={entry.href}
                href={entry.href}
                active={active}
                current={active ? "page" : undefined}
                iconName={entry.icon}
              >
                {entry.label}
              </NavLink>
            );
          })}
        </NavSection>
      ))}
    </NavMenu>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <>
      {MOBILE_NAV.map((item) => {
        const active = isActive(pathname, item.activeHref ?? item.href, item.exact);
        return (
          <DockLink
            key={item.href}
            href={item.href}
            current={active ? "page" : undefined}
            active={active}
            label={item.label}
            iconName={item.icon}
          />
        );
      })}
    </>
  );
}

export function AdminMobileRouteTabs() {
  const pathname = usePathname();
  const mobileTabs = getMobileRouteTabs(pathname);

  if (!mobileTabs) return null;

  return (
    <MobileRouteTabs>
      <Tabs
        ariaLabel={`${mobileTabs.group.title ?? "Admin"} section navigation`}
        items={mobileTabs.group.items.map((item) => ({
          id: item.href,
          href: item.href,
          label: item.label,
        }))}
        selectedKey={mobileTabs.selectedKey}
      />
    </MobileRouteTabs>
  );
}

type LogoutLocation = {
  href: string;
};

export async function handleLogout(location: LogoutLocation = window.location): Promise<void> {
  // Navigate only after sign-out succeeds, never while still authenticated.
  await signOut();
  location.href = ADMIN_LOGIN_REDIRECT_URL;
}

type AdminTopbarProps = {
  readonly onLogout?: () => void;
};

export function AdminTopbar({ onLogout }: AdminTopbarProps = {}) {
  const pathname = usePathname();
  const currentPageLabel = getCurrentPageLabel(pathname);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);

  return (
    <>
      <TopbarStart>
        <TopbarBrandLink href="/admin">id admin</TopbarBrandLink>
        <ResponsiveBreadcrumb items={["Admin", currentPageLabel]} />
      </TopbarStart>
      <TopbarEnd>
        <Button variant="ghost" size="sm" iconName="Bell" ariaLabel="Notifications" tooltip="Notifications" tooltipPlacement="bottom" />
        <TopbarAvatarMenu
          initials="AD"
          items={[
            { label: "Theme", onAction: () => setThemeDialogOpen(true) },
            { label: "Logout", onAction: onLogout ?? (() => { void handleLogout(); }) },
          ]}
        />
      </TopbarEnd>
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </>
  );
}
