// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithSwr as render } from "../_utils/swr-render";
import { RegistrationPoliciesContent } from "@/app/admin/_components/identity/registration-policies-content";
import { mockRegistrationIntents, mockRegistrationPolicies } from "@/app/admin/_mocks/registration-policies";
import type { RegistrationPolicy } from "@/app/admin/_actions/registration-policies";

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(policies: RegistrationPolicy[]) {
  let current = [...policies];
  const setStatus = vi.fn<(id: string, status: RegistrationPolicy["status"]) => Promise<RegistrationPolicy>>()
    .mockImplementation(async (id, status) => {
      const policy = current.find((entry) => entry.id === id);
      if (!policy) throw new Error("Policy not found");
      const next = { ...policy, status, updatedAt: Date.now() };
      current = current.map((entry) => entry.id === id ? next : entry);
      return next;
    });
  return {
    listRegistrationPolicies: vi.fn<() => Promise<RegistrationPolicy[]>>().mockImplementation(async () => current),
    enableRegistrationPolicy: vi.fn<(id: string) => Promise<RegistrationPolicy>>().mockImplementation((id) => setStatus(id, "enabled")),
    pauseRegistrationPolicy: vi.fn<(id: string) => Promise<RegistrationPolicy>>().mockImplementation((id) => setStatus(id, "paused")),
    archiveRegistrationPolicy: vi.fn<(id: string) => Promise<RegistrationPolicy>>().mockImplementation((id) => setStatus(id, "archived")),
    listRegistrationPolicyIntents: vi.fn<() => Promise<typeof mockRegistrationIntents>>().mockResolvedValue(mockRegistrationIntents),
  };
}

describe("RegistrationPoliciesContent", () => {
  it("renders loading and error states", () => {
    const { rerender } = render(<RegistrationPoliciesContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
    rerender(<RegistrationPoliciesContent error="Policy load failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Policy load failed");
  });

  it("renders policy rows and selected intent detail", async () => {
    render(<RegistrationPoliciesContent actions={makeActions(mockRegistrationPolicies)} selectedId="regpol_content_beta" />);
    await waitFor(() => expect(screen.getAllByText("Content beta").length).toBeGreaterThan(0));
    expect(screen.getAllByText("enabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("231/1000 used · 4 reserved").length).toBeGreaterThan(0);
    expect(await screen.findByText("new@acme.com")).toBeInTheDocument();
    expect(screen.getByText("oauth_continuation_failed")).toBeInTheDocument();
  });

  it("filters policies client-side", async () => {
    render(<RegistrationPoliciesContent actions={makeActions(mockRegistrationPolicies)} />);
    await waitFor(() => expect(screen.getByText("Content beta")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "trial" } });
    expect(screen.getByText("Trial waitlist")).toBeInTheDocument();
    expect(screen.queryByText("Content beta")).not.toBeInTheDocument();
  });

  it("pauses a policy from the row actions", async () => {
    const actions = makeActions(mockRegistrationPolicies);
    render(<RegistrationPoliciesContent actions={actions} />);
    await waitFor(() => expect(screen.getByText("Content beta")).toBeInTheDocument());
    const row = screen.getByText("Content beta").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^pause$/i }));
    await waitFor(() => expect(actions.pauseRegistrationPolicy).toHaveBeenCalledWith("regpol_content_beta"));
  });
});
