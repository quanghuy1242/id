import { redirect } from "next/navigation";

/**
 * Grants IA unification (docs/027 §6): sessions/tokens/consents now live under
 * `/admin/security`. This legacy path permanently redirects so old links and
 * bookmarks do not 404.
 */
export default function SessionsTokensRedirect() {
  redirect("/admin/security/sessions");
}
