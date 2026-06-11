# Admin Screen + Story Implementation Contract

> **Status:** Approved &nbsp;|&nbsp; **Date:** 2026-05-28 &nbsp;|&nbsp; **Scope:** `workers/ui`, `packages/ui`, `stories/`, `.agents/skills/id-admin-ui/SKILL.md`

## Table Of Contents

- [Goal](#goal)
- [Target Architecture](#target-architecture)
- [Decisions](#decisions)
- [Content Component Contract](#content-component-contract)
- [Actions File Contract](#actions-file-contract)
- [Route File Contract](#route-file-contract)
- [Story File Contract](#story-file-contract)
- [Shell Decorator](#shell-decorator)
- [Mock Data](#mock-data)
- [Workflow (Implementation Order)](#workflow-implementation-order)

---

## Goal

Every admin screen (`/admin/*`):

1. Has a Ladle story covering at minimum **populated**, **empty**, **loading**, and **one error** state.
2. Can be previewed in Ladle with mock data and full admin shell (topbar, sidebar, dock).
3. Has a thin route file that does only URL parsing and prop-passing to a pure content component.
4. Has data-fetching logic in `_actions/` files that are independently testable and mockable.

A story is **required before the route file is created**. No exceptions.

---

## Target Architecture

Three layers per screen, plus shared shell:

```
stories/_decorators/shell.tsx           ← reusable AdminShell wrapping every story

workers/ui/src/app/admin/
  _actions/
    users.ts                            ← listUsers(…), getUser(…), createUser(…), …
    organizations.ts
    teams.ts
    invitations.ts
    sessions.ts

  _mocks/                               ← shared mock data arrays (stories + tests)
    users.ts
    organizations.ts
    sessions.ts
    invitations.ts

  _components/
    admin-nav.tsx                       ← existing
    identity/
      users-list-content.tsx            ← pure content component
      user-detail-content.tsx
      user-sessions-content.tsx
      organizations-list-content.tsx
      organization-detail-content.tsx
      organization-members-content.tsx
      organization-teams-content.tsx
      organization-invitations-content.tsx

  identity/
    users/
      page.tsx                          ← thin route: URL params → <UsersListContent />
      [userId]/
        page.tsx
        sessions/
          page.tsx
    organizations/
      page.tsx
      [orgId]/
        page.tsx
        members/page.tsx
        teams/page.tsx
        invitations/page.tsx

stories/
  _decorators/
    shell.tsx                           ← AdminShell decorator
  admin.stories.tsx                     ← existing (shell smoke tests)
  button.stories.tsx                    ← existing
  auth-flow.stories.tsx                 ← existing
  identity/
    users-list.stories.tsx
    user-detail.stories.tsx
    user-sessions.stories.tsx
    organizations-list.stories.tsx
    organization-detail.stories.tsx
    organization-members.stories.tsx
    organization-teams.stories.tsx
    organization-invitations.stories.tsx
```

For every admin screen there is exactly:
- One content component in `_components/<section>/`
- One actions file per domain in `_actions/`
- One thin route file in the Next.js route directory
- One story file in `stories/<section>/`

---

## Decisions

### A. Content components own their data lifecycle

Content components call action functions internally (on mount and when internal state changes). They do **not** accept `users`, `total`, or any fetched data as props — those live in internal state populated after the action resolves.

The `loading` and `error` **override props** let the route file and stories force a display state without triggering a fetch:

- `loading?: boolean` — when `true`, the component skips the internal fetch entirely and shows the skeleton.
- `error?: string` — when set, skips the fetch and shows the error state.
- `onRetry?: () => void` — passed to `ErrorAlert` when `error` is set externally; internally wired to re-trigger the fetch.

This keeps the component self-contained while still allowing Ladle to show the loading and error states with zero boilerplate.

**Rejected alternative — data as required props:** Forces the route file to own the fetch lifecycle and requires every story to supply data arrays. This contradicts the goal of thin route files and produces story boilerplate.

### B. State overrides follow the hybrid-controlled pattern

Content components manage search, filter, sort, pagination, and modal open/close with internal `useState`. Each state variable also accepts an optional override prop. When the override is provided (not `undefined`), the component uses it instead of internal state and fires the corresponding callback.

- **Route file**: passes all overrides driven by `useSearchParams()`. Navigation callbacks use `router.push()`.
- **Story file**: passes zero overrides. The component manages all state internally. Users can interact with search, filters, sort, and pagination freely in Ladle.

### C. Actions files are plain async functions — no React

```ts
// _actions/users.ts
import type { User } from "@idco/lib";

export type ListUsersParams = {
  searchValue?: string;
  searchField?: "email" | "name";
  searchOperator?: "contains" | "starts_with" | "ends_with";
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterValue?: string;
  filterOperator?: string;
};

export type ListUsersResponse = {
  users: User[];
  total: number;
  limit: number;
  offset: number;
};

export async function listUsers(params: ListUsersParams): Promise<ListUsersResponse> {
  const url = new URL("/api/auth/admin/list-users", window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUser(userId: string): Promise<{ user: User }> {
  const url = new URL("/api/auth/admin/get-user", window.location.origin);
  url.searchParams.set("id", userId);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Benefits over inline fetch in `page.tsx`:
- Stories mock at the function boundary with `vi.mock` — no `window.fetch` interception.
- Actions are unit-testable in Vitest.
- URL construction and error handling are centralized per domain.

### D. Content components import actions directly

```ts
import { listUsers } from "../../_actions/users";
```

The component calls the action directly. The route file is a thin wrapper that renders the component. Stories replace the module with `vi.mock`.

**Rejected alternative — prop injection:** `type Props = { listUsers: typeof userActions.listUsers }` adds prop surface for no benefit. `vi.mock` handles mocking at the module level without touching props.

### E. Stories mock at the fetch level — not with `vi.mock`

Ladle runs stories in the browser via Vite's dev server, not inside Vitest's test runner. `vi.mock` is a Vitest transform — it is unavailable in Ladle. The correct approach for Ladle stories is intercepting `window.fetch` at the URL level:

```tsx
function mockFetch(users: User[], total: number) {
  window.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/api/auth/admin/list-users")) {
      return new Response(JSON.stringify({ users, total, limit: 25, offset: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };
}
```

Call `mockFetch(...)` at the top of each story function before returning JSX. Because the content component calls `listUsers()` (which calls `fetch`) on mount inside a `useEffect`, the mock is in place before the effect fires.

`vi.mock` remains valid for Vitest unit tests of action functions in isolation. Do not use it in story files.

### F. Every screen spec must have a story

The spec in `workers/ui/docs/screens/<section>.md` is the prerequisite for both the content component and the story. A route file must not be created before both exist and the story has been verified in Ladle.

---

## Content Component Contract

Every content component must:

1. **Own its data lifecycle.** Call action functions in a `useEffect` triggered by internal state changes (search, filter, sort, page). Initialize with `isLoading = true` and `data = null`.
2. **Accept `loading` and `error` override props.** When `loading={true}`, skip the fetch and render `Skeleton`. When `error` is a string, skip the fetch and render `ErrorAlert`.
3. **Manage internal UI state with `useState`.** Search text, filter selection, sort column/direction, current page, modal open/close — all internal. Accept optional override props for each (route file passes them from `useSearchParams`).
4. **Fire navigation callbacks** (`onRowClick`, `onBackClick`). Never call `router.push()` directly.
5. **Own zero URL logic.** No `useSearchParams`, no `usePathname`, no `useRouter`.
6. **Render only `@idco/ui` components.** No raw Tailwind, no raw DaisyUI, no raw HTML layout tags.

### Prop shape template

```tsx
type UsersListContentProps = {
  // State overrides — undefined means component manages internally
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  roleFilter?: string;
  onRoleFilterChange?: (value: string) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  page?: number;
  onPageChange?: (page: number) => void;

  // Navigation callbacks
  onRowClick?: (userId: string) => void;

  // Display overrides — forces a display state without triggering a fetch
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};
```

### Internal data management sketch

```tsx
export function UsersListContent({ loading: loadingOverride, error: errorOverride, onRetry, ...props }: UsersListContentProps) {
  const [data, setData] = useState<ListUsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | undefined>();

  // Internal UI state
  const [searchValue, setSearchValue] = useState(props.searchValue ?? "");
  // ... (filter, sort, page)

  const effectiveSearch = props.searchValue ?? searchValue;
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  useEffect(() => {
    if (loadingOverride) return; // skip fetch when forced loading
    setIsLoading(true);
    listUsers({ searchValue: effectiveSearch, /* ... */ })
      .then((res) => { setData(res); setFetchError(undefined); })
      .catch((err) => setFetchError(String(err.message)))
      .finally(() => setIsLoading(false));
  }, [effectiveSearch, loadingOverride /*, other deps */]);

  if (showLoading) return <Skeleton rows={5} />;
  if (showError) return <ErrorAlert message={showError} onRetry={onRetry ?? (() => { setFetchError(undefined); setIsLoading(true); })} />;
  if (!data || data.users.length === 0) return <EmptyState message="No users found." cta="Create user" onCta={() => {}} />;

  return (
    <DataTable columns={columns} rows={data.users} getRowKey={(u) => u.id} onRowClick={props.onRowClick} /* ... */ />
  );
}
```

---

## Actions File Contract

Every `_actions/<domain>.ts` file:

1. Exports typed async functions — one per API endpoint the domain touches.
2. Takes typed params objects; returns typed response objects. Types align with `@idco/lib` schemas or inline-match the API contract.
3. Constructs URLs with `new URL(path, window.location.origin)`.
4. Throws on non-ok responses with the response text as the error message.
5. Never imports React. Never uses hooks. Never references the DOM beyond `window.location.origin`.

---

## Route File Contract

Every `page.tsx`:

1. Renders exactly one content component.
2. Reads URL params via `useSearchParams()` and passes them as override props.
3. Passes navigation callbacks: `onRowClick={(id) => router.push(\`/admin/identity/users/${id}\`)}`.
4. Wraps in `PageBody` if the content component does not include it.
5. Stays under ~40 lines.

```tsx
// workers/ui/src/app/admin/identity/users/page.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody } from "@idco/ui";
import { UsersListContent } from "../../_components/identity/users-list-content";

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <PageBody>
      <UsersListContent
        searchValue={searchParams.get("q") ?? undefined}
        roleFilter={searchParams.get("role") ?? undefined}
        sortBy={searchParams.get("sortBy") ?? undefined}
        sortDirection={(searchParams.get("sortDir") as "asc" | "desc") ?? undefined}
        page={Number(searchParams.get("page")) || undefined}
        onSearchChange={(v) => router.push(`/admin/identity/users?q=${encodeURIComponent(v)}`)}
        onRowClick={(id) => router.push(`/admin/identity/users/${id}`)}
      />
    </PageBody>
  );
}
```

---

## Story File Contract

Every story file:

1. Imports the **content component** — never the `page.tsx` route file.
2. Intercepts `window.fetch` at the URL level for `Populated` and `Empty`. Uses `loading`/`error` props for the other two states.
3. Exports at minimum four named stories: `Populated`, `Empty`, `Loading`, `Error`.
4. Wraps every story in `<AdminShell activePath="...">`.
5. Uses mock data from `_mocks/`.

**Why fetch interception, not `vi.mock`:** Ladle runs stories in the browser via Vite's dev server, not inside Vitest's test runner. `vi.mock` is a Vitest transform plugin — it is unavailable in Ladle. Intercepting `window.fetch` at the URL level is the correct approach for Ladle. `vi.mock` remains valid for Vitest unit tests of action functions in isolation — do not use it in story files.

```tsx
// stories/identity/users-list.stories.tsx
import type { Story, StoryDefault } from "@ladle/react";
import { UsersListContent } from "../../workers/ui/src/app/admin/_components/identity/users-list-content";
import { AdminShell } from "../_decorators/shell";
import { mockUsers } from "../../workers/ui/src/app/admin/_mocks/users";

function mockFetch(users: typeof mockUsers, total: number) {
  window.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/api/auth/admin/list-users")) {
      return new Response(
        JSON.stringify({ users, total, limit: 25, offset: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  };
}

export default { title: "Identity / Users List" } satisfies StoryDefault;

export const Populated: Story = () => {
  mockFetch(mockUsers, mockUsers.length);
  return <AdminShell activePath="/admin/identity/users"><UsersListContent /></AdminShell>;
};

export const Empty: Story = () => {
  mockFetch([], 0);
  return <AdminShell activePath="/admin/identity/users"><UsersListContent /></AdminShell>;
};

// loading prop skips the internal fetch and shows Skeleton immediately.
export const Loading: Story = () => (
  <AdminShell activePath="/admin/identity/users">
    <UsersListContent loading />
  </AdminShell>
);

// error prop skips the internal fetch and shows ErrorAlert immediately.
export const Error: Story = () => (
  <AdminShell activePath="/admin/identity/users">
    <UsersListContent error="Failed to load users: Network error" />
  </AdminShell>
);
```

---

## Shell Decorator

The decorator mirrors `workers/ui/src/app/admin/layout.tsx` exactly, using the real nav components. `setMockPathname` is called before the return so that `usePathname()` inside the nav components resolves to the correct path during render.

```tsx
// stories/_decorators/shell.tsx
import type { ReactNode } from "react";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock } from "@idco/ui";
import { AdminTopbar, AdminSidebarNav, AdminMobileNav } from "../../workers/ui/src/app/admin/_components/admin-nav";
import { setMockPathname } from "../../.ladle/mocks/next-navigation";

type AdminShellProps = {
  readonly activePath: string;
  readonly children: ReactNode;
};

export function AdminShell({ activePath, children }: AdminShellProps) {
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);

  return (
    <AppShell>
      <Topbar>
        <AdminTopbar />
      </Topbar>
      <SidebarLayout>
        <Sidebar>
          <AdminSidebarNav />
        </Sidebar>
        <MainContent>{children}</MainContent>
      </SidebarLayout>
      <MobileDock>
        <AdminMobileNav />
      </MobileDock>
    </AppShell>
  );
}
```

This replaces the per-story pattern in `stories/admin.stories.tsx` where `AdminLayout` and `AdminPage` are imported and assembled manually. The decorator handles all chrome; stories only provide the content component and mock setup.

---

## Mock Data

Each `_mocks/<domain>.ts` exports one array typed against the `@idco/lib` schema, with enough variety to cover all badge states, filter combinations, and edge cases:

```ts
// workers/ui/src/app/admin/_mocks/users.ts
import type { User } from "@idco/lib";

export const mockUsers: User[] = [
  {
    id: "user_001",
    name: "John Doe",
    email: "john@acme.com",
    emailVerified: true,
    image: null,
    role: "admin",
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "user_002",
    name: "Jane Adams",
    email: "jane@acme.com",
    emailVerified: false,
    image: null,
    role: "user",
    banned: true,
    banReason: "Spam",
    banExpires: "2025-06-15T00:00:00.000Z",
    createdAt: "2024-02-01T00:00:00.000Z",
    updatedAt: "2024-02-01T00:00:00.000Z",
  },
  // 5–10 entries total, covering all role/status/badge combinations
];
```

Mock files belong in `_mocks/` under `workers/ui/src/app/admin/`. They are imported by stories and may be imported by Vitest tests. They must not import React or any browser API.

---

## Workflow (Implementation Order)

Do not skip or reorder steps. The story gate (step 4b–4c) must pass before the route file (step 4d) is created.

1. **Create `_mocks/`** — one file per domain with realistic mock data covering all states (active, banned, unverified, no members, etc.).
2. **Create `_actions/`** — one file per domain with typed async functions wrapping each API endpoint.
3. **Create `stories/_decorators/shell.tsx`** — the `AdminShell` decorator (once, shared by all stories).
4. **For each screen, in order: users list → user detail → user sessions → orgs list → org detail → members → teams → invitations:**
   - **a.** Confirm the screen spec exists in `workers/ui/docs/screens/<section>.md` (ASCII sketch + Components block + Data block). Draft it if missing; get approval before continuing.
   - **b.** Create the content component in `_components/<section>/<name>-content.tsx`.
   - **c.** Create the story file in `stories/<section>/<name>.stories.tsx` with at minimum `Populated`, `Empty`, `Loading`, `Error` exports.
   - **d.** Verify in Ladle (`pnpm dev:i`) — all four states must render without errors before continuing.
   - **e.** Create the thin route file in the Next.js route directory.
   - **f.** Remove any obsolete direct page-import stories from `stories/admin.stories.tsx`.
