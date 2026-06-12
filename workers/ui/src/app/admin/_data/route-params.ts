export function buildRouteParams(
  current: { readonly toString: () => string },
  overrides: Record<string, string | null>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next.toString();
}
