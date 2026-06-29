/**
 * Types for the `id-oauth-context-selection` plugin. The plugin takes no
 * options and owns no rows; this file exists to satisfy the
 * architecture/auth-plugin-folder-shape linter and to name the selection-header
 * contract shared with the OAuth provider's post-login callbacks.
 */

/** Request header the select-authorization-context form sends with its `/oauth2/continue` POST. */
export type OAuthContextSelectionHeader = "x-id-oauth-context";
