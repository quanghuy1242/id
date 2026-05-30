import { useState } from "react";
import { MobileFilterMenu, Stack, Text, Inline } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Mobile Filter Menu" } satisfies StoryDefault;

const roleOptions = [
  { value: "all", label: "All Roles" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
] as const;

const statusOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
] as const;

function MobileWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="[&_button]:!inline-flex p-4">
      <Stack gap="md" align="start">
        <Text variant="caption">
          Mobile-only component. The wrapper forces visibility for Ladle.
        </Text>
        {children}
      </Stack>
    </div>
  );
}

export const NoFilters: Story = () => {
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  return (
    <MobileWrapper>
      <MobileFilterMenu
        groups={[
          { key: "role", label: "Role", options: roleOptions, value: role, onChange: setRole },
          { key: "status", label: "Status", options: statusOptions, value: status, onChange: setStatus },
        ]}
      />
      <Text variant="caption">
        Role: {role}, Status: {status}
      </Text>
    </MobileWrapper>
  );
};

export const OneFilterActive: Story = () => {
  const [role, setRole] = useState("admin");
  const [status, setStatus] = useState("all");

  return (
    <MobileWrapper>
      <MobileFilterMenu
        groups={[
          { key: "role", label: "Role", options: roleOptions, value: role, onChange: setRole },
          { key: "status", label: "Status", options: statusOptions, value: status, onChange: setStatus },
        ]}
      />
      <Text variant="caption">
        Role: {role}, Status: {status}
      </Text>
    </MobileWrapper>
  );
};

export const BothFiltersActive: Story = () => {
  const [role, setRole] = useState("admin");
  const [status, setStatus] = useState("banned");

  return (
    <MobileWrapper>
      <MobileFilterMenu
        groups={[
          { key: "role", label: "Role", options: roleOptions, value: role, onChange: setRole },
          { key: "status", label: "Status", options: statusOptions, value: status, onChange: setStatus },
        ]}
      />
      <Text variant="caption">
        Role: {role}, Status: {status}
      </Text>
    </MobileWrapper>
  );
};

export const Sizes: Story = () => {
  const [roleSm, setRoleSm] = useState("admin");
  const [statusSm, setStatusSm] = useState("all");
  const [roleMd, setRoleMd] = useState("user");
  const [statusMd, setStatusMd] = useState("banned");

  return (
    <MobileWrapper>
      <Stack gap="md">
        <Stack gap="xs">
          <Text variant="caption">size=&quot;sm&quot;</Text>
          <MobileFilterMenu
            size="sm"
            groups={[
              { key: "role", label: "Role", options: roleOptions, value: roleSm, onChange: setRoleSm },
              { key: "status", label: "Status", options: statusOptions, value: statusSm, onChange: setStatusSm },
            ]}
          />
        </Stack>
        <Stack gap="xs">
          <Text variant="caption">size=&quot;md&quot; (default)</Text>
          <MobileFilterMenu
            size="md"
            groups={[
              { key: "role", label: "Role", options: roleOptions, value: roleMd, onChange: setRoleMd },
              { key: "status", label: "Status", options: statusOptions, value: statusMd, onChange: setStatusMd },
            ]}
          />
        </Stack>
      </Stack>
    </MobileWrapper>
  );
};

export const WithDesktopFilters: Story = () => {
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  return (
    <Stack gap="md">
      <Text variant="body">
        Desktop view: filter dropdowns are visible. Mobile view (&lt;1024px): &quot;...&quot; button replaces them.
      </Text>
      <Inline gap="sm">
        <span className="badge badge-outline">Role: {role}</span>
        <span className="badge badge-outline">Status: {status}</span>
      </Inline>
      <MobileFilterMenu
        groups={[
          { key: "role", label: "Role", options: roleOptions, value: role, onChange: setRole },
          { key: "status", label: "Status", options: statusOptions, value: status, onChange: setStatus },
        ]}
      />
    </Stack>
  );
};
