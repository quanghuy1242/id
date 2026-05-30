import { permanentRedirect } from "next/navigation";

export default function OAuthPage() {
  permanentRedirect("/admin/oauth/applications");
}
