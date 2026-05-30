"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Button,
  ConfirmDialog,
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
import { ADMIN_LOGIN_REDIRECT_URL, MOBILE_NAV, SIDEBAR_NAV, type AdminNavItem } from "@/shared/constants";
import { signOut } from "../_actions/users";

type SidebarGroup = {
  title: string | null;
  items: AdminNavItem[];
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function getBestActiveItem<TItem extends AdminNavItem>(
  pathname: string,
  items: readonly TItem[],
): TItem | undefined {
  let bestItem: TItem | undefined;
  let bestScore = -1;

  for (const item of items) {
    if (!isActive(pathname, item.activeHref ?? item.href, item.exact)) continue;

    const score = (item.activeHref ?? item.href).length;
    if (score > bestScore) {
      bestItem = item;
      bestScore = score;
    }
  }

  return bestItem;
}

function getSidebarItems(): AdminNavItem[] {
  return SIDEBAR_NAV.flatMap((entry) => entry.type === "group" ? entry.items : [entry]);
}

function getCurrentPageLabel(pathname: string): string {
  const activeEntry = getBestActiveItem(pathname, getSidebarItems());
  return activeEntry?.label ?? "Dashboard";
}

function getSidebarNavGroups(): SidebarGroup[] {
  return SIDEBAR_NAV.filter((entry) => entry.type === "group").map((entry) => ({
    title: entry.label,
    items: [...entry.items],
  }));
}

function getSectionPrefix(href: string): string {
  const [, adminSegment, sectionSegment] = href.split("/");
  return `/${adminSegment}/${sectionSegment}`;
}

function getMobileRouteTabs(pathname: string): { group: SidebarGroup; selectedKey: string } | null {
  const groups = getSidebarNavGroups();
  const activeGroup = groups.find((group) => {
    const firstItem = group.items[0];
    if (!firstItem) return false;
    return isActive(pathname, firstItem.activeHref ?? getSectionPrefix(firstItem.href));
  });

  if (!activeGroup || activeGroup.items.length < 2) return null;

  const selectedItem = getBestActiveItem(pathname, activeGroup.items) ?? activeGroup.items[0];

  return { group: activeGroup, selectedKey: selectedItem.href };
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  const activeItem = getBestActiveItem(pathname, getSidebarItems());

  return (
    <NavMenu label="Admin sidebar navigation">
      {SIDEBAR_NAV.map((entry) => {
        if (entry.type === "group") {
          return (
            <NavSection key={entry.label} title={entry.label} collapsible>
              {entry.items.map((item) => {
                const active = activeItem?.href === item.href;
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    active={active}
                    current={active ? "page" : undefined}
                    iconName={item.icon}
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </NavSection>
          );
        }

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
  readonly onLogout?: () => void | Promise<void>;
};

export function AdminTopbar({ onLogout }: AdminTopbarProps = {}) {
  const pathname = usePathname();
  const currentPageLabel = getCurrentPageLabel(pathname);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | undefined>();

  async function confirmLogout() {
    setLogoutError(undefined);
    try {
      await (onLogout ? onLogout() : handleLogout());
      return true;
    } catch (err: unknown) {
      setLogoutError(err instanceof Error ? err.message : "Failed to log out");
      return false;
    }
  }

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
            { label: "Logout", onAction: () => setLogoutOpen(true) },
          ]}
        />
      </TopbarEnd>
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={(o) => { setLogoutOpen(o); if (!o) setLogoutError(undefined); }}
        title="Log Out"
        description="You will need to sign in again, verify your email if prompted, and complete MFA before returning to the dashboard."
        confirmLabel="Log Out"
        variant="danger"
        error={logoutError}
        onConfirm={confirmLogout}
      />
    </>
  );
}
