The context:
The user wants to:

Apply the nested layout approach for both the user detail page and the org detail page
Update the skill file to document this pattern

For User Detail:
Current structure:

/admin/identity/users/[userId]/page.tsx — renders UserDetailContent (header + tabs + overview panel)
/admin/identity/users/[userId]/sessions/page.tsx — renders UserDetailContent + UserSessionsContent
Target structure:

/admin/identity/users/[userId]/layout.tsx — renders header + tabs (new UserHeaderContent component)

/admin/identity/users/[userId]/page.tsx — renders overview panel only

/admin/identity/users/[userId]/sessions/page.tsx — renders sessions content only

Overview page: consumes user from context, shows user details + action buttons (edit, role, password, ban - these open dialogs). Move these dialogs here since they're only relevant to overview.
Sessions page: fetches sessions independently.
For Org Detail:

Layout: fetches org ONCE. Shows header (back + name + slug + delete button) + tabs. Keeps delete dialog in layout.
Overview page: consumes org from context, shows org details + edit button. Edit dialog is here.
Members/Teams/Invitations pages: fetch their own data

Now I see the full picture. The UserSessionsContent component ALSO fetches the user data (for the header) and renders the header + tabs + sessions. This needs the same refactor.

The sessions component has its own getUser call, its own header render (pageHeader), and its own Tabs component. After the refactor, the sessions component should ONLY render the sessions list, and the header + tabs would come from the layout.

But the user?.name reference in the "Revoke All Sessions" description dialog needs the user data. After the refactor, the sessions component could read from context OR could just use a generic message.

If the sessions component reads the user from context, it can still show the user's name in the dialog. So the refactored component would read user from context for the dialog, skip fetching user itself, skip rendering the header and tabs, and only handle the sessions panel plus revoke dialogs. The loading and error override props would then only affect the sessions part, not the entire page.

For the stories, I could either wrap them in the provider to supply mock user data, or make the component gracefully fall back to "this user" when no context exists. The cleanest approach is probably passing userName as an optional prop from the page route, which could derive it from context or other sources. I'm going back and forth on how to pass the user name to the sessions component. The cleanest approach is to have the page read from context and pass it as a prop to the content component, keeping the content layer free from context dependencies.

So the sessions content component takes an optional userName prop for the dialog descriptions, the page fetches the user name from context and passes it down, and I'm creating a new header component that reads user and session data directly from the provider to handle the back link, name display, and badge rendering. I'm going to apply the same pattern to the organizations section, creating a provider for context, separate header and overview content components, and simplified sub-pages. Before I dive in, I should check the existing tests to understand what needs updating, then start implementing file by file.

Now I have a comprehensive picture. Let me track the work with TodoWrite and start implementing.

The test file imports UserDetailContent — after the refactor, I'll need to update the tests. The tests test the combined component (header + overview). After the refactor, the tests should test:

UserDetailHeaderContent - loading skeleton, impersonate/stop-impersonating buttons
UserDetailOverviewContent - user details, edit/ban/delete dialogs
But I also need to keep backward compatibility... actually no. Since we're refactoring, let's just update the tests to match the new structure.

Looking at the test cases, I can see they're spread across both the header and overview components — the loading skeleton and impersonate buttons belong to the header, while the error alerts, dialogs, and ban functionality belong to the overview. I could write a combined integration test that renders the full layout, or split them into separate unit tests for each component. I think keeping them separate makes more sense for clarity.

Now I'm mapping out all the files I need to create systematically, starting with the context provider, then the header and overview content components, followed by the layout file and any supporting utilities. I need to continue updating the remaining files in the refactoring—the organization detail pages for members, teams, and invitations all need their headers removed, then update the story files and test files to reflect the new component structure. The old user-detail-content.tsx and organization-detail-content.tsx files will be completely replaced by their split components and deleted. But I need to keep the other content files like organization-members-content.tsx, organization-teams-content.tsx, and organization-invitations-content.tsx since they're unchanged, while user-sessions-content.tsx gets refactored to remove the header, tabs, and user fetching logic. Now I'm thinking through how the Tabs component will work with the new structure.

Looking at how tabs are currently set up, they use href attributes for navigation, which means clicking a tab triggers an anchor navigation rather than relying on the onSelectionChange callback. I need to verify whether the Tabs component is using Next.js Link under the hood or just plain anchor tags, since that affects how the routing will work with the refactored components.

For the new layout structure, if tabs are truly navigating via href, then I can remove the onNavigate* callbacks entirely and let Next.js handle the routing automatically. This would clean up the layout significantly.

For the Storybook stories that need to simulate different loading states, I'll need to add loading and error override props to the provider so I can control those states independently of actual data fetching.

Defining the provider with loading and error overrides... I'm setting up a refetch callback that increments a key to trigger re-fetches, then wrapping everything in a context provider that passes down the user data, loading/error states, and actions to child components. The loading and error overrides let stories easily simulate different states without needing actual data fetching.

Now I'm thinking through which actions belong in context versus as props. The provider should only handle the read operations like getUser and getCurrentSession for initial data loading, while mutation actions get passed directly to the components that need them—the header gets impersonateUser and stopImpersonating, and the overview gets the user management actions like updateUser, setRole, and banUser.

Writing the layout component... Writing component structure...

The sessions content component just needs the userId and optional userName to fetch and display the list, while the page wrapper handles reading those values from params and context. The stories would wrap everything in the provider to show different loading states. Now I need to check the existing tests to see what assertions need updating. Now I'm mapping out the full implementation order—starting with the user context and header, then moving through the user detail pages, followed by the organization context and its corresponding components, and finally wrapping up with stories, tests, and the skill file.

Now I have a full picture. Let me plan everything out carefully and start implementing. I'll track with TodoWrite.



Key decisions:

Context approach: Provider owns fetch, provides state to all children

Header component: reads from context, renders back link + name + badge + action button + tabs

Overview content: reads from context, renders detail panel + mutation dialogs

Sessions content: stripped to just session list (no header/tabs)

Layout: wraps everything in Provider + renders Header + {children} inside Stack gap="md" inside PageBody

Tests: refactor to use Provider + Header + Overview composed

Naming: I'll split the old monolithic content components into separate header and overview pieces, with a shared context hook for both users and organizations

For tests, I'll compose the Provider with Header and Overview together rather than testing them in isolation—this gives better integration coverage and reduces setup complexity. I'm about to check how the Tabs component works.

OK so when items have href, the Tabs component uses Next.js Link for navigation. The onSelectionChange is optional and can be omitted when using href-based navigation.

Now I have everything I need. Let me start implementing.

My plan for the layout structure:


workers/ui/src/app/admin/identity/users/[userId]/
├── layout.tsx               ← NEW: UserDetailProvider + UserDetailHeaderContent + {children}
├── page.tsx                 ← UPDATE: just UserDetailOverviewContent


└── sessions/
    └── page.tsx             ← UPDATE: just UserSessionsContent (simplified)

workers/ui/src/app/admin/identity/organizations/[orgId]/
├── layout.tsx               ← NEW: OrganizationDetailProvider + OrganizationDetailHeaderContent + {children}
├── page.tsx                 ← UPDATE: just OrganizationDetailOverviewContent
├── members/
│   └── page.tsx             ← UPDATE: just OrganizationMembersContent
├── teams/
│   └── page.tsx             ← UPDATE: just OrganizationTeamsContent
└── invitations/
    └── page.tsx             ← UPDATE: just OrganizationInvitationsContent


    Now I'm ready to start implementing. For the UserDetailProvider context, I need to figure out how to split the actions. The existing UserDetailContent has a bunch of server actions, and I need to distribute them across the provider, header, and overview components based on their responsibilities—the provider handles data fetching, the header manages impersonation, and the overview handles all the user mutations.

For the layout structure, I'm thinking about whether PageBody should live in the layout or in each individual page. If it's in the layout, the pages stay cleaner, but I need to figure out how that affects the overall structure and whether the Suspense boundary should wrap everything or just specific parts. I'm realizing the layout-level Suspense creates a problem—it would only show the header skeleton without knowing what the page content should look like. Instead, I'll skip the Suspense at the layout level and let each page handle its own content skeleton, since they're the ones calling useParams anyway. The layout just needs to provide the context and PageBody wrapper.

Writing the layout component...

Actually, I need to reconsider—useParams is synchronous and doesn't trigger a de-opt like useSearchParams does, so the layout can safely call it directly without Suspense. But now I'm realizing the existing pages also have PageBody, so I'll need to remove those duplicates when I move it up to the layout. I'm realizing that useParams and useRouter don't actually require Suspense boundaries—only useSearchParams has that restriction. The existing pages might have Suspense unnecessarily, so I should verify whether it's truly needed or if I can simplify the structure further. Writing the layout component... I'm realizing I'm overcomplicating this—the layout doesn't need Suspense since useParams and useRouter are synchronous, and the actual data loading happens inside the Provider through useEffect, which already handles its own loading states. So I'll keep the structure simple: just render the Provider directly without wrapping it in Suspense, and let the header component manage its own skeleton display while data loads. I realize the Suspense pattern from CLAUDE.md is specifically for useSearchParams(), not for layouts in general. Since the layout doesn't need useSearchParams() and layouts don't get SSR'd the same way as pages, I'll keep the layout simple without the extra Suspense wrapper.

Now I'm ready to start implementing. I'll work through the components in order: first the user detail context and header/overview content components, then update the sessions component, create the user layout and pages, and finally do the same pattern for organizations.

Check list:

Create user-detail-context.tsx (Provider + useUserDetail hook) (done)

Create user-detail-header-content.tsx (back link, name, badge, impersonate, tabs) (done)

Create user-detail-overview-content.tsx (detail panel + all mutation dialogs) (done)

Slim down user-sessions-content.tsx (remove header, tabs, user fetch) (done)

Create users/[userId]/layout.tsx

Update users/[userId]/page.tsx and sessions/page.tsx

Create org-detail-context.tsx

Create org-detail-header-content.tsx (back link, name, slug, delete, tabs)

Create org-detail-overview-content.tsx (details panel + edit dialog)

Create orgs/[orgId]/layout.tsx and update all sub-pages

Update stories for user and org detail

Update tests for user and org detail

Run pnpm check and fix any issues

Update skill file with nested layout pattern