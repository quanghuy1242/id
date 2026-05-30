import { redirect } from "next/navigation";

export default function OAuthPage() {
  redirect("/admin/oauth/applications");
}
