// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountShell } from "@/app/account/_components/account-shell";
import { AccountOverviewContent } from "@/app/account/_components/account-overview-content";
import { AccountProfileContent } from "@/app/account/_components/account-profile-content";
import { AccountSecurityContent } from "@/app/account/_components/account-security-content";
import { AccountSessionsContent } from "@/app/account/_components/account-sessions-content";
import { AccountConsentsContent } from "@/app/account/_components/account-consents-content";
import { AccountOrganizationsContent } from "@/app/account/_components/account-organizations-content";
import { createMockAccountActions } from "@/app/account/_mocks/account";
import { renderWithSwr as render } from "../_utils/swr-render";

const navigationMock = vi.hoisted(() => ({ pathname: "/account" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

describe("Account Center content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMock.pathname = "/account";
  });

  it("renders every account section in the mobile dock", () => {
    navigationMock.pathname = "/account/organizations";

    render(
      <AccountShell actions={createMockAccountActions()}>
        <span>Account content</span>
      </AccountShell>,
    );

    const dock = screen.getByRole("navigation", { name: /account mobile navigation/i });

    expect(within(dock).getAllByRole("link")).toHaveLength(6);
    expect(within(dock).getByRole("link", { name: "Org" })).toHaveAttribute("href", "/account/organizations");
    expect(within(dock).getByRole("link", { name: "Org" })).toHaveClass("dock-active");
  });

  it("renders overview stats and organization preview from account endpoints", async () => {
    render(<AccountOverviewContent actions={createMockAccountActions()} />);

    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
    const organizationsStat = screen.getAllByText("Organizations").find((element) => element.closest(".stat"))?.closest(".stat");
    if (!organizationsStat) throw new Error("missing organizations stat");
    expect(within(organizationsStat).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("submits supported profile fields through the injected action", async () => {
    const updateProfile = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(<AccountProfileContent actions={createMockAccountActions({ updateProfile })} />);

    fireEvent.change(await screen.findByLabelText(/display name/i), { target: { value: "Updated Name" } });
    fireEvent.change(screen.getByLabelText(/avatar url/i), { target: { value: "https://example.test/avatar.png" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        name: "Updated Name",
        image: "https://example.test/avatar.png",
      });
    });
  });

  it("validates and changes the password", async () => {
    const changePassword = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(<AccountSecurityContent actions={createMockAccountActions({ changePassword })} />);

    fireEvent.change(await screen.findByLabelText(/current password/i), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password-123",
        revokeOtherSessions: true,
      });
    });
  });

  it("lists sessions without session token material and revokes by session id", async () => {
    const revokeAccountSession = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(
      <AccountSessionsContent
        actions={createMockAccountActions({ revokeAccountSession })}
        onSignedOut={() => undefined}
      />,
    );

    expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
    expect(screen.queryByText(/session_token/i)).not.toBeInTheDocument();
    const phoneRow = screen.getByText("Safari on iPhone").closest("tr");
    if (!phoneRow) throw new Error("missing phone session row");
    fireEvent.click(within(phoneRow).getByRole("button", { name: /revoke/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^revoke$/i }));

    await waitFor(() => {
      expect(revokeAccountSession).toHaveBeenCalledWith("sess_phone");
    });
  });

  it("lists connected applications and disconnects by client id", async () => {
    const revokeAccountConsent = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(<AccountConsentsContent actions={createMockAccountActions({ revokeAccountConsent })} />);

    expect(await screen.findByText("Books App")).toBeInTheDocument();
    const booksRow = screen.getByText("Books App").closest("tr");
    if (!booksRow) throw new Error("missing books consent row");
    fireEvent.click(within(booksRow).getByRole("button", { name: /disconnect/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^disconnect$/i }));

    await waitFor(() => {
      expect(revokeAccountConsent).toHaveBeenCalledWith("client_books");
    });
  });

  it("renders organization memberships and console affordances by authorization state", async () => {
    render(<AccountOrganizationsContent actions={createMockAccountActions()} />);

    expect(await screen.findByText("Default")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open console/i })).toHaveAttribute("href", "/admin/orgs/org_default");
    expect(screen.getByText("Member Workspace")).toBeInTheDocument();
    expect(screen.getByText("Member access")).toBeInTheDocument();
  });

  it("renders loading and error overrides without fetching", () => {
    const actions = createMockAccountActions({ getAccountSummary: vi.fn<() => Promise<never>>() });
    const { container, rerender } = render(<AccountOverviewContent loading actions={actions} />);
    expect(container.querySelector(".skeleton")).not.toBeNull();

    rerender(<AccountOverviewContent error="Account unavailable" actions={actions} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Account unavailable");
    expect(actions.getAccountSummary).not.toHaveBeenCalled();
  });
});
