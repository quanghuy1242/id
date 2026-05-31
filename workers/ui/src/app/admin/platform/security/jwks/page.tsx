"use client";

import { useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { JwksContent } from "../../../_components/security/jwks-content";

export default function PlatformSecurityJwksPage() {
  const router = useRouter();

  return (
    <PageBody>
      <JwksContent onKeyClick={(kid) => router.push(`/admin/platform/security/jwks/${kid}`)} />
    </PageBody>
  );
}
