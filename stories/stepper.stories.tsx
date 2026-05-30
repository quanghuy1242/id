import { useState } from "react";
import { RadioGroup, ScopeBuilder, Stack, Stepper, type Step, Text, UrlListBuilder } from "@id/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Stepper" } satisfies StoryDefault;

export const CreateApplicationWizard: Story = () => {
  const [active, setActive] = useState(0);
  const [type, setType] = useState("web");
  const [uris, setUris] = useState<string[]>(["https://app.example.com/callback"]);
  const [scopes, setScopes] = useState<string[]>(["openid", "profile"]);

  const steps: Step[] = [
    {
      id: "type",
      label: "Type",
      content: (
        <RadioGroup
          title="Application type"
          name="type"
          value={type}
          onChange={setType}
          options={[
            { value: "web", label: "Web (confidential)" },
            { value: "spa", label: "SPA (PKCE)" },
            { value: "m2m", label: "Machine-to-machine" },
          ]}
        />
      ),
    },
    {
      id: "uris",
      label: "URIs",
      isValid: type === "m2m" || uris.some((u) => u.trim() !== ""),
      content: <UrlListBuilder label="Redirect URIs" value={uris} onChange={setUris} addLabel="Add redirect URI" />,
    },
    {
      id: "scopes",
      label: "Scopes",
      content: (
        <ScopeBuilder
          label="Scopes"
          value={scopes}
          onChange={setScopes}
          suggestions={[
            { value: "openid" },
            { value: "profile" },
            { value: "email" },
            { value: "content:read" },
          ]}
        />
      ),
    },
    {
      id: "review",
      label: "Review",
      content: (
        <Stack gap="sm">
          <Text variant="body">Type: {type}</Text>
          <Text variant="body">Redirects: {uris.join(", ") || "—"}</Text>
          <Text variant="body">Scopes: {scopes.join(" ") || "—"}</Text>
        </Stack>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <Text variant="h2">New application</Text>
      <Stepper
        steps={steps}
        activeStep={active}
        onStepChange={setActive}
        onComplete={() => window.alert("Application created")}
        completeLabel="Create application"
      />
    </Stack>
  );
};

export const StepInvalid: Story = () => {
  const [active, setActive] = useState(0);
  const steps: Step[] = [
    { id: "a", label: "Blocked", isValid: false, content: <Text variant="body">This step is invalid; Next is disabled.</Text> },
    { id: "b", label: "Next", content: <Text variant="body">Second step.</Text> },
  ];
  return <Stepper steps={steps} activeStep={active} onStepChange={setActive} onComplete={() => {}} />;
};

export const Compact: Story = () => {
  const [active, setActive] = useState(0);
  const steps: Step[] = [
    { id: "type", label: "Type", content: <Text variant="body">Choose a client type.</Text> },
    { id: "review", label: "Review", content: <Text variant="body">Review the draft.</Text> },
  ];
  return <Stepper steps={steps} activeStep={active} onStepChange={setActive} onComplete={() => {}} size="sm" />;
};
