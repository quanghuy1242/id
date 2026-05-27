// Link-based navigation tabs for URL-routed admin detail pages.
// Each tab is a full page navigation link, not an in-page panel switch.
// Active state is determined by the caller passing currentPath (usePathname() in Next.js).

type TabNavItem = {
  readonly href: string;
  readonly label: string;
  readonly active?: boolean;
};

type TabNavProps = {
  readonly items: ReadonlyArray<TabNavItem>;
};

export function TabNav({ items }: TabNavProps) {
  return (
    <nav className="flex gap-1 border-b border-base-300 px-6" aria-label="Page tabs">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            item.active
              ? "border-primary text-primary"
              : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
