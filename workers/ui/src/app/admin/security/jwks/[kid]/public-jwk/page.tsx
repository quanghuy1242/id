"use client";

import { useParams } from "next/navigation";
import { JwksDetailContent } from "../../../../_components/security/jwks-detail-content";

export default function JwksPublicJwkPage() {
  const params = useParams<{ kid: string }>();
  return <JwksDetailContent kid={params.kid} activeTab="public-jwk" />;
}
