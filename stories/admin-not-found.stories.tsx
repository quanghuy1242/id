import type { Story, StoryDefault } from "@ladle/react";
import { AdminShell } from "./_decorators/shell";
import AdminNotFound from "../workers/ui/src/app/admin/not-found";

export default {
  title: "Admin / System / Not Found",
} satisfies StoryDefault;

export const Default: Story = () => (
  <AdminShell activePath="/admin/oauth/applications">
    <AdminNotFound />
  </AdminShell>
);
