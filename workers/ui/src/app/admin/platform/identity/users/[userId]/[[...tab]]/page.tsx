"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { ActivityLogContent } from "../../../../../_components/activity-log-content";
import { UserDetailProvider } from "../../../../../_components/identity/user-detail-context";
import { UserDetailHeaderContent } from "../../../../../_components/identity/user-detail-header-content";
import { UserDetailOverviewContent } from "../../../../../_components/identity/user-detail-overview-content";
import { UserSessionsContent } from "../../../../../_components/identity/user-sessions-content";

type UserDetailTab = "overview" | "sessions" | "audit";

function activeTab(value: unknown): UserDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  if (tab === "sessions" || tab === "audit") return tab;
  return "overview";
}

function tabContent(tab: UserDetailTab, userId: string) {
  if (tab === "sessions") return <UserSessionsContent userId={userId} />;
  if (tab === "audit") return <ActivityLogContent targetType="user" targetId={userId} />;
  return <UserDetailOverviewContent />;
}

export default function PlatformUserDetailPage() {
  const params = useParams<{ userId: string; tab?: string[] }>();
  const router = useRouter();
  const tab = activeTab(params.tab);
  const routeBasePath = `/admin/platform/identity/users/${params.userId}`;

  return (
    <PageBody>
      <UserDetailProvider userId={params.userId}>
        <Stack gap="md">
          <UserDetailHeaderContent
            activeTab={tab}
            routeBasePath={routeBasePath}
            backHref="/admin/platform/identity/users"
            onImpersonateRedirect={() => router.push("/")}
            onNavigateToUsers={() => router.push("/admin/platform/identity/users")}
          />
          {tabContent(tab, params.userId)}
        </Stack>
      </UserDetailProvider>
    </PageBody>
  );
}
