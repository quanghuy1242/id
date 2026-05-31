"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Badge,
  Button,
  ConfirmDialog,
  DockLink,
  Menu,
  MenuItem,
  MenuTrigger,
  MobileRouteTabs,
  NavLink,
  NavMenu,
  NavSection,
  ResponsiveBreadcrumb,
  ScopePickerTrigger,
  Tabs,
  ThemeDialog,
  TopbarAvatarMenu,
  TopbarBrandLink,
  TopbarEnd,
  TopbarStart,
} from "@id/ui";
import {
  ADMIN_LOGIN_REDIRECT_URL,
  visibleNavSections,
  type VisibleConsoleNavItem,
  type VisibleConsoleNavSection,
} from "@/shared/constants";
import { signOut } from "../_actions/users";
import { useAdminScope } from "./admin-scope-provider";

type SidebarGroup = {
  title: string | null;
  items: VisibleConsoleNavItem[];
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const hrefPath = href.split("?")[0] ?? href;
  return exact ? pathname === hrefPath : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function getBestActiveItem<TItem extends VisibleConsoleNavItem>(
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

function getSidebarItems(groups: readonly SidebarGroup[]): VisibleConsoleNavItem[] {
  return groups.flatMap((entry) => entry.items);
}

function getCurrentPageLabel(pathname: string, groups: readonly SidebarGroup[]): string {
  const activeEntry = getBestActiveItem(pathname, getSidebarItems(groups));
  return activeEntry?.label ?? "Dashboard";
}

function getSidebarNavGroups(sections: readonly VisibleConsoleNavSection[]): SidebarGroup[] {
  return sections.map((entry) => ({
    title: entry.label,
    items: [...entry.items],
  }));
}

function getMobileRouteTabs(pathname: string, groups: readonly SidebarGroup[]): { group: SidebarGroup; selectedKey: string } | null {
  const activeGroup = groups.find((group) => group.items.some((item) => isActive(pathname, item.href, item.exact)));

  if (!activeGroup || activeGroup.items.length < 2) return null;

  const selectedItem = getBestActiveItem(pathname, activeGroup.items) ?? activeGroup.items[0];

  return { group: activeGroup, selectedKey: selectedItem.href };
}

function mobileLabel(section: VisibleConsoleNavSection, item: VisibleConsoleNavItem, scopeKind: "platform" | "organization"): string {
  if (section.id === "overview") return scopeKind === "organization" ? "Overview" : "Dash";
  if (section.id === "identity") return "Identity";
  if (section.id === "applications") return "Apps";
  if (section.id === "access") return "Access";
  if (section.id === "security") return "Security";
  return item.label;
}

function initialsFromEmail(email: string | undefined): string {
  if (!email) return "AD";
  const [name] = email.split("@");
  return (name?.slice(0, 2) || "AD").toUpperCase();
}

function scopeTone(kind: "platform" | "organization"): "accent" | "info" {
  return kind === "platform" ? "accent" : "info";
}

function scopeBadgeLabel(scope: { readonly kind: "platform" | "organization"; readonly role: string }): string {
  return scope.kind === "platform" ? "Platform" : scope.role;
}

function ScopeSelector() {
  const { envelope, activeScope, loading, error, switchHref } = useAdminScope();
  const scopeLabel = loading ? "Loading scope" : activeScope.label;

  return (
    <MenuTrigger placement="bottom start">
      <ScopePickerTrigger label={scopeLabel} tone={scopeTone(activeScope.kind)} />
      <Menu aria-label="Console scopes">
        {envelope.scopes.map((scope) => {
          const selected = scope.id === activeScope.id;
          return (
            <MenuItem
              key={scope.id}
              href={switchHref(scope)}
              textValue={`${scope.label} ${scopeBadgeLabel(scope)}`}
              className={selected ? "font-semibold" : undefined}
            >
              {scope.label}
              <Badge tone={selected ? scopeTone(scope.kind) : "neutral"} size="sm">
                {scopeBadgeLabel(scope)}
              </Badge>
            </MenuItem>
          );
        })}
        {envelope.memberships.map((membership) => (
          <MenuItem
            key={membership.organizationId}
            href="/account/organizations"
            label={membership.label}
            badge="Member"
          />
        ))}
        {error ? <MenuItem key="scope-error" label="Scope check failed" badge="Retry" /> : null}
      </Menu>
    </MenuTrigger>
  );
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  const { activeScope } = useAdminScope();
  const groups = getSidebarNavGroups(visibleNavSections(activeScope));
  const activeItem = getBestActiveItem(pathname, getSidebarItems(groups));

  function renderSidebarItem(item: VisibleConsoleNavItem) {
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
  }

  return (
    <NavMenu label="Admin sidebar navigation">
      {groups.map((entry) => {
        if (entry.items.length === 1 && entry.items[0]) return renderSidebarItem(entry.items[0]);

        return (
          <NavSection key={entry.title} title={entry.title ?? undefined} collapsible>
            {entry.items.map(renderSidebarItem)}
          </NavSection>
        );
      })}
    </NavMenu>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();
  const { activeScope } = useAdminScope();
  const sections = visibleNavSections(activeScope);

  return (
    <>
      {sections.map((section) => {
        const item = section.items.find((entry) => entry.mobile) ?? section.items[0];
        if (!item) return null;
        const active = section.items.some((entry) => isActive(pathname, entry.href, entry.exact));
        return (
          <DockLink
            key={section.id}
            href={item.href}
            current={active ? "page" : undefined}
            active={active}
            label={mobileLabel(section, item, activeScope.kind)}
            iconName={item.icon}
          />
        );
      })}
    </>
  );
}

export function AdminMobileRouteTabs() {
  const pathname = usePathname();
  const { activeScope } = useAdminScope();
  if (activeScope.kind === "organization") return null;

  const mobileTabs = getMobileRouteTabs(pathname, getSidebarNavGroups(visibleNavSections(activeScope)));

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
  const { activeScope, envelope } = useAdminScope();
  const currentPageLabel = getCurrentPageLabel(pathname, getSidebarNavGroups(visibleNavSections(activeScope)));
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
        <TopbarBrandLink href="/admin">id</TopbarBrandLink>
        <ResponsiveBreadcrumb leadingItem={<ScopeSelector />} items={[currentPageLabel]} />
      </TopbarStart>
      <TopbarEnd>
        <Button variant="ghost" size="sm" iconName="Bell" ariaLabel="Notifications" tooltip="Notifications" tooltipPlacement="bottom" />
        <TopbarAvatarMenu
          initials={initialsFromEmail(envelope.actor.email)}
          items={[
            { label: envelope.actor.email ?? "Account", badge: "Account", href: "/account" },
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
