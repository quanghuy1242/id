import type { Story, StoryDefault } from "@ladle/react";
import AdminPage from "../workers/ui/src/app/admin/page";
import { AdminShell } from "./_decorators/shell";

export default {
  title: "Admin / Dashboard",
} satisfies StoryDefault;

export const Dashboard: Story = () => {
  return (
    <AdminShell activePath="/admin/platform">
      <AdminPage />
    </AdminShell>
  );
};

export const IdentityUsersShell: Story = () => {
  return (
    <AdminShell activePath="/admin/platform/identity/users">
      <AdminPage />
    </AdminShell>
  );
};
