export type OAuthClientAdminPluginOptions = {
  readonly authorize?: (
    organizationId: string | null | undefined,
    userId: string,
    role: string | null | undefined,
    adapter: unknown,
  ) => Promise<boolean>;
};
