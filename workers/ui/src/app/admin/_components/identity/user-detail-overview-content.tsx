"use client";

import {
  Alert,
  Avatar,
  Badge,
  DescriptionList,
  Inline,
  Panel,
  Skeleton,
  Stack,
} from "@idco/ui";
import { useUserDetail } from "./user-detail-context";

export function UserDetailOverviewContent() {
  const { user, isLoading, error } = useUserDetail();

  if (isLoading) return <Skeleton rows={4} height="md" />;
  if (error) return null;
  if (!user) return null;

  return (
    <Stack gap="md">
      {user.banned && (
        <Alert tone="warning">
          This user is banned.
          {user.banReason ? ` Reason: ${user.banReason}.` : ""}
          {user.banExpires ? ` Expires: ${new Date(user.banExpires).toLocaleDateString()}.` : " (permanent)"}
        </Alert>
      )}

      <Panel>
        <Stack gap="md">
          <Inline gap="md" align="start">
            <Avatar
              initials={user.name?.slice(0, 2).toUpperCase()}
              image={user.image ?? undefined}
              alt={user.name}
              size="lg"
            />
            <DescriptionList
              columns={3}
              items={[
                { term: "Name", description: user.name },
                { term: "Email", description: user.email, mono: true },
                { term: "Role", description: <Badge tone={user.role === "admin" ? "primary" : "neutral"}>{user.role}</Badge> },
                { term: "Email Verified", description: user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge> },
                { term: "Status", description: user.banned ? <Badge tone="error">Banned</Badge> : <Badge tone="success">Active</Badge> },
                { term: "Created", description: new Date(user.createdAt).toLocaleDateString() },
              ]}
            />
          </Inline>
        </Stack>
      </Panel>
    </Stack>
  );
}
