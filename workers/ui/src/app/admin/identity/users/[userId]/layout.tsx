"use client";

import type { ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { UserDetailProvider } from "../../../_components/identity/user-detail-context";
import { UserDetailHeaderContent } from "../../../_components/identity/user-detail-header-content";

type UserDetailLayoutProps = {
  readonly children: ReactNode;
};

export default function UserDetailLayout({ children }: UserDetailLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const userId = String(params.userId ?? "");
  const activeTab = pathname?.endsWith("/sessions") ? "sessions" : pathname?.endsWith("/audit") ? "audit" : "overview";

  return (
    <PageBody>
      <UserDetailProvider userId={userId}>
        <Stack gap="md">
          <UserDetailHeaderContent
            activeTab={activeTab}
            onImpersonateRedirect={() => router.push("/")}
          />
          {children}
        </Stack>
      </UserDetailProvider>
    </PageBody>
  );
}
