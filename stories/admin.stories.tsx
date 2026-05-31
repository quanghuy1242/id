import type { Story, StoryDefault } from "@ladle/react";
import PlatformDashboardPage from "../workers/ui/src/app/admin/platform/page";
import { AdminShell } from "./_decorators/shell";

export default {
  title: "Admin / Dashboard",
} satisfies StoryDefault;

export const Dashboard: Story = () => {
  return (
    <AdminShell activePath="/admin/platform">
      <PlatformDashboardPage />
    </AdminShell>
  );
};

export const IdentityUsersShell: Story = () => {
  return (
    <AdminShell activePath="/admin/platform/identity/users">
      <PlatformDashboardPage />
    </AdminShell>
  );
};
