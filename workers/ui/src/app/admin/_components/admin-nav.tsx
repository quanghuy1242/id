"use client";

import { usePathname } from "next/navigation";
import {
  DockLink,
  MobileRouteTabs,
  NavLink,
  NavMenu,
  NavSection,
  Tabs,
  TopbarAvatarMenu,
  TopbarBreadcrumb,
  TopbarBrandLink,
  TopbarEnd,
  TopbarSearchField,
  TopbarStart,
} from "@id/ui";
import { MOBILE_NAV, SIDEBAR_NAV } from "@/shared/constants";

type SidebarItem = { label: string; href: string; exact?: boolean; icon?: string };

type SidebarGroup = {
  title: string | null;
  items: SidebarItem[];
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

function getCurrentPageLabel(pathname: string): string {
  const activeEntry = SIDEBAR_NAV.find(
    (entry) => entry.type === "item" && isActive(pathname, entry.href, entry.exact),
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

  const selectedItem =
    activeGroup.items.find((item) => isActive(pathname, item.href, item.exact)) ?? activeGroup.items[0];

  return { group: activeGroup, selectedKey: selectedItem.href };
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  const { groups, topLevelItems } = getSidebarNavGroups();

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
