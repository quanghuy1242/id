"use client";

import { useRouter } from "next/navigation";
import { JwksContent } from "../../_components/security/jwks-content";

export default function JwksPage() {
  const router = useRouter();

  return <JwksContent onKeyClick={(kid) => router.push(`/admin/security/jwks/${kid}`)} />;
}
