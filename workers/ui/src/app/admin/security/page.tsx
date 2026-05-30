import { redirect } from "next/navigation";

/**
 * The Security section opens on the Sessions grants surface (docs/027 §6). The
 * section root has no page of its own; the route tabs in `security/layout.tsx`
 * own sub-navigation.
 */
export default function SecurityIndex() {
  redirect("/admin/security/sessions");
}
