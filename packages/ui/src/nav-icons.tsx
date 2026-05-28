// DaisyUI 5 dock icon sizing: https://daisyui.com/components/dock/
// DaisyUI 5 menu: https://daisyui.com/components/menu/
import {
  Activity,
  AppWindow,
  Bot,
  Building2,
  FileCheck2,
  Fingerprint,
  Globe,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Link2,
  Plus,
  Server,
  Settings,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Activity,
  AppWindow,
  Bot,
  Building2,
  FileCheck2,
  Fingerprint,
  Globe,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Link2,
  Plus,
  Server,
  Settings,
  Tags,
  Users,
};

type NavIconVariant = "sidebar" | "dock";

const sizeMap: Record<NavIconVariant, string> = {
  sidebar: "size-4",
  dock: "size-[1.2em]",
};

export function NavIcon({ name, variant = "sidebar" }: { name?: string; variant?: NavIconVariant }) {
  if (!name) return null;
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon className={`${sizeMap[variant]} shrink-0`} aria-hidden="true" />;
}
