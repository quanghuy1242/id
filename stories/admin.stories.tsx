import type { Story, StoryDefault } from "@ladle/react";
import { setMockPathname } from "../.ladle/mocks/next-navigation";
import AdminLayout from "../workers/ui/src/app/admin/layout";
import AdminPage from "../workers/ui/src/app/admin/page";

function setMockUrl(pathname: string) {
  setMockPathname(pathname);
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", pathname);
}

export default {
  title: "Admin",
} satisfies StoryDefault;

export const Dashboard: Story = () => {
  setMockUrl("/admin");
  return (
    <AdminLayout>
      <AdminPage />
    </AdminLayout>
  );
};

export const IdentityUsersShell: Story = () => {
  setMockUrl("/admin/identity/users");
  return (
    <AdminLayout>
      <AdminPage />
    </AdminLayout>
  );
};
