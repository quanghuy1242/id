"use client";

import { type ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  AppShell,
  Button,
  ConfirmDialog,
  DockLink,
  MainContent,
  MobileDock,
  NavLink,
  NavMenu,
  ResponsiveBreadcrumb,
  Sidebar,
  SidebarLayout,
  ThemeDialog,
  ToastRegion,
  Topbar,
  TopbarAvatarMenu,
  TopbarBrandLink,
  TopbarEnd,
  TopbarStart,
} from "@idco/ui";
import { accountSummaryKey } from "../_data/swr-keys";
import { defaultAccountActions, signOut, type AccountActions } from "../_actions/account";

type AccountShellProps = {
  readonly children: ReactNode;
  readonly actions?: Pick<AccountActions, "getAccountSummary">;
  readonly onLogout?: () => void | Promise<void>;
};

const accountNav = [
  { href: "/account", label: "Overview", iconName: "LayoutDashboard", exact: true, mobileLabel: "Home" },
  { href: "/account/profile", label: "Profile", iconName: "UserCog", exact: false, mobileLabel: "Profile" },
  { href: "/account/security", label: "Security", iconName: "ShieldCheck", exact: false, mobileLabel: "Security" },
  { href: "/account/sessions", label: "Sessions", iconName: "Clock", exact: false, mobileLabel: "Sessions" },
  { href: "/account/consents", label: "Connected apps", iconName: "AppWindow", exact: false, mobileLabel: "Apps" },
  { href: "/account/organizations", label: "Organizations", iconName: "Building2", exact: false, mobileLabel: "Org" },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function currentItem(pathname: string) {
  return accountNav.find((item) => isActive(pathname, item.href, item.exact)) ?? accountNav[0];
}

function initialsFromEmail(email: string | undefined): string {
  if (!email) return "AC";
  const [name] = email.split("@");
  return (name?.slice(0, 2) || "AC").toUpperCase();
}

async function handleLogout(location: Location = window.location): Promise<void> {
  await signOut();
  location.href = "/login?callbackURL=/account";
}

export function AccountShell({
  children,
  actions = defaultAccountActions,
  onLogout,
}: AccountShellProps) {
  const pathname = usePathname() ?? "/account";
  const active = currentItem(pathname);
  const { data } = useSWR(accountSummaryKey(), () => actions.getAccountSummary());
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
      <AppShell>
        <Topbar>
          <TopbarStart>
            <TopbarBrandLink href="/account">id</TopbarBrandLink>
            <ResponsiveBreadcrumb items={[active.label]} />
          </TopbarStart>
          <TopbarEnd>
            <Button variant="ghost" size="sm" iconName="Bell" ariaLabel="Notifications" tooltip="Notifications" tooltipPlacement="bottom" />
            <TopbarAvatarMenu
              initials={initialsFromEmail(data?.user.email)}
              items={[
                { label: data?.user.email ?? "Account", badge: "Account", href: "/account" },
                { label: "Console", href: "/admin" },
                { label: "Theme", onAction: () => setThemeDialogOpen(true) },
                { label: "Logout", onAction: () => setLogoutOpen(true) },
              ]}
            />
          </TopbarEnd>
        </Topbar>
        <SidebarLayout>
          <Sidebar>
            <NavMenu label="Account navigation">
              {accountNav.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  active={active.href === item.href}
                  current={active.href === item.href ? "page" : undefined}
                  iconName={item.iconName}
                >
                  {item.label}
                </NavLink>
              ))}
            </NavMenu>
          </Sidebar>
          <MainContent>{children}</MainContent>
        </SidebarLayout>
        <MobileDock ariaLabel="Account mobile navigation">
          {accountNav.map((item) => (
            <DockLink
              key={item.href}
              href={item.href}
              active={active.href === item.href}
              current={active.href === item.href ? "page" : undefined}
              label={item.mobileLabel}
              iconName={item.iconName}
            />
          ))}
        </MobileDock>
      </AppShell>
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={(open) => { setLogoutOpen(open); if (!open) setLogoutError(undefined); }}
        title="Log Out"
        description="You will need to sign in again before returning to your account."
        confirmLabel="Log Out"
        variant="danger"
        error={logoutError}
        onConfirm={confirmLogout}
      />
      <ToastRegion />
    </>
  );
}
