// @vitest-environment jsdom

import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";
import { ApplicationsContent } from "@/app/admin/_components/oauth/applications-content";
import { oauthClientsKey, resourceServersKey } from "@/app/admin/_data/swr-keys";
import type { ActiveScope } from "@idco/lib";
import type { OAuthClient } from "@/app/admin/_actions/oauth";

const orgA: ActiveScope = { kind: "organization", organizationId: "org_a" };
const orgB: ActiveScope = { kind: "organization", organizationId: "org_b" };

function client(clientId: string, name: string, organizationId: string): OAuthClient {
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: ["https://app.example.test/callback"],
    grant_types: ["client_credentials"],
    response_types: [],
    token_endpoint_auth_method: "client_secret_post",
    scope: "content:read",
    reference_id: organizationId,
  };
}

function SharedCache({ children }: { readonly children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
      {children}
    </SWRConfig>
  );
}

describe("admin scope cache isolation", () => {
  it("keys scoped OAuth and resource data by route scope", () => {
    expect(oauthClientsKey(orgA)).not.toEqual(oauthClientsKey(orgB));
    expect(resourceServersKey(orgA)).not.toEqual(resourceServersKey(orgB));
  });

  it("does not reuse OAuth client rows across organization routes after the active-org bridge switches", async () => {
    const activeOrganizationIds: string[] = [];
    const actions = {
      listClients: vi.fn<(scope?: ActiveScope) => Promise<OAuthClient[]>>().mockImplementation(async (scope) => {
        const organizationId = scope?.kind === "organization" ? scope.organizationId : "";
        activeOrganizationIds.push(organizationId);
        return organizationId === "org_a"
          ? [client("cli_a", "Org A Service", "org_a")]
          : [client("cli_b", "Org B Service", "org_b")];
      }),
      rotateClientSecret: vi.fn<(clientId: string, scope?: ActiveScope) => Promise<{ client_secret: string }>>(),
      deleteClient: vi.fn<(clientId: string, scope?: ActiveScope) => Promise<void>>(),
    };

    render(
      <SharedCache>
        <ApplicationsContent scope={orgA} variant="serviceAccounts" actions={actions} />
        <ApplicationsContent scope={orgB} variant="serviceAccounts" actions={actions} />
      </SharedCache>,
    );

    await waitFor(() => expect(screen.getByText("Org A Service")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Org B Service")).toBeInTheDocument());
    expect(screen.queryByText("Org A Service")?.closest("table")).not.toBe(screen.queryByText("Org B Service")?.closest("table"));
    expect(actions.listClients).toHaveBeenCalledWith(orgA);
    expect(actions.listClients).toHaveBeenCalledWith(orgB);
    expect(activeOrganizationIds).toEqual(expect.arrayContaining(["org_a", "org_b"]));
  });
});
