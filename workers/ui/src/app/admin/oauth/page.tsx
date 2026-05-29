"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OAuthPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/oauth/applications");
  }, [router]);
  return null;
}
