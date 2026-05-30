"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TokensContent, type TokenType } from "../../_components/security/tokens-content";

function TokensPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type: TokenType = searchParams.get("type") === "refresh" ? "refresh" : "access";

  return (
    <TokensContent
      type={type}
      onTypeChange={(next) => router.push(`/admin/security/tokens?type=${next}`)}
    />
  );
}

export default function TokensPage() {
  return (
    <Suspense fallback={<TokensContent loading />}>
      <TokensPageContent />
    </Suspense>
  );
}
