// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplicationCreateWizardContent } from "@/app/admin/_components/oauth/application-create-wizard-content";
import type { CreateClientInput, OAuthClient, OAuthResourceScope } from "@/app/admin/_actions/oauth";
import { renderWithSwr as render } from "../_utils/swr-render";

const createdClient: OAuthClient = {
  client_id: "cli_content",
  client_name: "Content API",
  client_secret: "secret_once",
  redirect_uris: [],
  grant_types: ["client_credentials"],
  response_types: [],
  token_endpoint_auth_method: "client_secret_post",
  scope: "",
};

describe("ApplicationCreateWizardContent", () => {
  it("navigates once after the one-time secret dialog closes", async () => {
    const onCreated = vi.fn<(clientId: string) => void>();
    const actions = {
      listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue([]),
      createClient: vi.fn<(input: CreateClientInput) => Promise<OAuthClient>>().mockResolvedValue(createdClient),
    };

    render(<ApplicationCreateWizardContent actions={actions} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Content API" } });
    fireEvent.click(screen.getByLabelText("Machine-to-machine"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /create application/i }));

    await waitFor(() => expect(actions.createClient).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("secret_once")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith("cli_content");
  });
});
