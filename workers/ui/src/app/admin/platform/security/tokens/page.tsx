"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@idco/ui";
import { TokensContent, type TokenType } from "../../../_components/security/tokens-content";

function PlatformSecurityTokensPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type: TokenType = searchParams.get("type") === "refresh" ? "refresh" : "access";

  return (
    <TokensContent
      type={type}
      onTypeChange={(next) => router.push(`/admin/platform/security/tokens?type=${next}`)}
    />
  );
}

export default function PlatformSecurityTokensPage() {
  return (
    <PageBody>
      <Suspense fallback={<TokensContent loading />}>
        <PlatformSecurityTokensPageContent />
      </Suspense>
    </PageBody>
  );
}
