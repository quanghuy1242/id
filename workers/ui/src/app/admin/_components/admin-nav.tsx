"use client";

import { usePathname } from "next/navigation";
import {
  DockLink,
  NavLink,
  NavMenu,
  NavSection,
  TopbarAvatarMenu,
  TopbarBreadcrumb,
  TopbarBrandLink,
  TopbarEnd,
  TopbarSearchField,
  TopbarStart,
} from "@id/ui";
import { MOBILE_NAV, SIDEBAR_NAV } from "@/shared/constants";

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

function getCurrentPageLabel(pathname: string): string {
  const activeEntry = SIDEBAR_NAV.find(
    (entry) => entry.type === "item" && isActive(pathname, entry.href, entry.exact),
  );
  return activeEntry?.label ?? "Dashboard";
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  const groups: Array<{
    title: string | null;
    items: Array<{ label: string; href: string; exact?: boolean; icon?: string }>;
  }> = [];
  const topLevelItems: Array<{ label: string; href: string; exact?: boolean; icon?: string }> = [];

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

  return (
    <NavMenu label="Admin sidebar navigation">
      {topLevelItems.map((entry) => {
        const active = isActive(pathname, entry.href, entry.exact);
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
            const active = isActive(pathname, entry.href, entry.exact);
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
        const active = isActive(pathname, item.href, item.exact);
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

export function AdminTopbar() {
  const pathname = usePathname();
  const currentPageLabel = getCurrentPageLabel(pathname);

  return (
    <>
      <TopbarStart>
        <TopbarBrandLink href="/admin">id admin</TopbarBrandLink>
        <TopbarBreadcrumb items={["Admin", currentPageLabel]} />
      </TopbarStart>
      <TopbarEnd>
        <TopbarSearchField placeholder="Search" />
        <TopbarAvatarMenu
          initials="AD"
          items={[
            { label: "Profile", href: "/admin/profile", badge: "New" },
            { label: "Settings", href: "/admin/settings" },
            { label: "Logout", href: "/logout" },
          ]}
        />
      </TopbarEnd>
    </>
  );
}
