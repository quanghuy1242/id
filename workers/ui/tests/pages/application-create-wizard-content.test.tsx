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
  redirect_uris: ["https://service.example.com/callback"],
  grant_types: ["client_credentials"],
  response_types: [],
  token_endpoint_auth_method: "client_secret_post",
  scope: "",
};

describe("ApplicationCreateWizardContent", () => {
  it("does not offer machine-to-machine from the application creation flow", () => {
    const actions = {
      listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue([]),
      createClient: vi.fn<(input: CreateClientInput) => Promise<OAuthClient>>().mockResolvedValue(createdClient),
    };

    render(<ApplicationCreateWizardContent actions={actions} />);

    expect(screen.getByRole("heading", { name: "New OAuth Application" })).toBeInTheDocument();
    expect(screen.getByLabelText("Web server")).toBeChecked();
    expect(screen.getByLabelText("SPA / native")).toBeInTheDocument();
    expect(screen.queryByLabelText("Machine-to-machine")).not.toBeInTheDocument();
  });

  it("uses a fixed service-account creation flow", () => {
    const actions = {
      listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue([]),
      createClient: vi.fn<(input: CreateClientInput) => Promise<OAuthClient>>().mockResolvedValue(createdClient),
    };

    render(
      <ApplicationCreateWizardContent
        actions={actions}
        variant="serviceAccount"
        title="New Service Account"
        completeLabel="Create service account"
      />,
    );

    expect(screen.getByRole("heading", { name: "New Service Account" })).toBeInTheDocument();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.queryByText("Auth")).not.toBeInTheDocument();
    expect(screen.queryByText("Application Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Machine-to-machine")).not.toBeInTheDocument();
  });

  it("navigates once after the one-time secret dialog closes", async () => {
    const onCreated = vi.fn<(clientId: string) => void>();
    const actions = {
      listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue([]),
      createClient: vi.fn<(input: CreateClientInput) => Promise<OAuthClient>>().mockResolvedValue(createdClient),
    };

    render(
      <ApplicationCreateWizardContent
        actions={actions}
        variant="serviceAccount"
        completeLabel="Create service account"
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Content API" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.change(screen.getByLabelText("Redirect URIs 1"), { target: { value: "https://service.example.com/callback" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /create service account/i }));

    await waitFor(() => expect(actions.createClient).toHaveBeenCalledTimes(1));
    expect(actions.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        grant_types: ["client_credentials"],
        redirect_uris: ["https://service.example.com/callback"],
        response_types: [],
        token_endpoint_auth_method: "client_secret_post",
      }),
      { kind: "platform" },
    );
    expect(actions.createClient.mock.calls[0]?.[0]).not.toHaveProperty("public");
    expect(actions.createClient.mock.calls[0]?.[0]).not.toHaveProperty("post_logout_redirect_uris");
    expect(await screen.findByText("secret_once")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith("cli_content");
  });
});
