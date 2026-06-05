export type ConsoleScopesPluginOptions = {
  /** Callback injected by composition to identify platform-admin sessions. */
  readonly isPlatformAdmin?: (role: unknown) => boolean;
};
