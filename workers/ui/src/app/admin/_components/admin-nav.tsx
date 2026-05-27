"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavTitle, Text, TopbarEnd, TopbarStart } from "@id/ui";
import { MOBILE_NAV, SIDEBAR_NAV } from "@/shared/constants";

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <ul>
      {SIDEBAR_NAV.map((entry, i) => {
        if (entry.type === "section") {
          return <NavTitle key={`section-${i}`}>{entry.label}</NavTitle>;
        }
        const active = isActive(pathname, entry.href, entry.exact);
        return (
          <li key={entry.href}>
            <Link
              href={entry.href}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
            >
              {entry.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <>
      {MOBILE_NAV.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={active ? "dock-active" : ""}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AdminTopbar() {
  return (
    <>
      <TopbarStart>
        <Text variant="h3" as="span">id admin</Text>
      </TopbarStart>
      <TopbarEnd>
        <Text variant="caption" as="span">Admin</Text>
      </TopbarEnd>
    </>
  );
}
