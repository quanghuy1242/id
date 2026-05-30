import type { ReactNode } from "react";
import SecurityLayout from "../../workers/ui/src/app/admin/security/layout";
import { AdminShell } from "./shell";

type SecurityShellProps = {
  readonly activePath: string;
  readonly children: ReactNode;
};

export function SecurityShell({ activePath, children }: SecurityShellProps) {
  return (
    <AdminShell activePath={activePath}>
      <SecurityLayout>{children}</SecurityLayout>
    </AdminShell>
  );
}
