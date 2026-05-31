import type { ReactNode } from "react";
import { AccountShell } from "./_components/account-shell";
import { AccountSwrProvider } from "./_components/account-swr-provider";

export default function AccountLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AccountSwrProvider>
      <AccountShell>{children}</AccountShell>
    </AccountSwrProvider>
  );
}

