import { Button, LinkButton, Stack, Inline, Text } from "@id/ui";
import type { Story } from "@ladle/react";

export const Variants: Story = () => (
  <Stack>
    <Text variant="h2">Primary</Text>
    <Inline gap="sm">
      <Button variant="primary" size="sm">Primary sm</Button>
      <Button variant="primary" size="md">Primary md</Button>
      <Button variant="primary" size="sm" disabled>Primary sm disabled</Button>
      <Button variant="primary" size="md" disabled>Primary md disabled</Button>
    </Inline>

    <Text variant="h2">Secondary</Text>
    <Inline gap="sm">
      <Button variant="secondary" size="sm">Secondary sm</Button>
      <Button variant="secondary" size="md">Secondary md</Button>
      <Button variant="secondary" size="sm" disabled>Secondary sm disabled</Button>
      <Button variant="secondary" size="md" disabled>Secondary md disabled</Button>
    </Inline>

    <Text variant="h2">Danger</Text>
    <Inline gap="sm">
      <Button variant="danger" size="sm">Danger sm</Button>
      <Button variant="danger" size="md">Danger md</Button>
      <Button variant="danger" size="sm" disabled>Danger sm disabled</Button>
      <Button variant="danger" size="md" disabled>Danger md disabled</Button>
    </Inline>

    <Text variant="h2">Link Buttons</Text>
    <Inline gap="sm">
      <LinkButton href="#" variant="primary" size="sm">Link primary sm</LinkButton>
      <LinkButton href="#" variant="secondary" size="sm">Link secondary sm</LinkButton>
      <LinkButton href="#" variant="danger" size="sm">Link danger sm</LinkButton>
      <LinkButton href="#" variant="primary" size="md">Link primary md</LinkButton>
      <LinkButton href="#" variant="secondary" size="md">Link secondary md</LinkButton>
      <LinkButton href="#" variant="danger" size="md">Link danger md</LinkButton>
    </Inline>
  </Stack>
);

export const Sizes: Story = () => (
  <Inline gap="sm" align="end">
    <Stack align="start">
      <Text variant="caption">sm</Text>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="secondary" size="sm">Small</Button>
      <Button variant="danger" size="sm">Small</Button>
    </Stack>
    <Stack align="start">
      <Text variant="caption">md</Text>
      <Button variant="primary" size="md">Medium</Button>
      <Button variant="secondary" size="md">Medium</Button>
      <Button variant="danger" size="md">Medium</Button>
    </Stack>
  </Inline>
);

export const Disabled: Story = () => (
  <Inline gap="sm">
    <Button variant="primary" disabled>Primary</Button>
    <Button variant="secondary" disabled>Secondary</Button>
    <Button variant="danger" disabled>Danger</Button>
  </Inline>
);

export const SubmitButton: Story = () => (
  <Stack align="start">
    <form
      onSubmit={(e) => {
        e.preventDefault();
        alert("Submitted!");
      }}
    >
      <Stack align="start">
        <Text variant="body">This button submits a form</Text>
        <Button variant="primary" type="submit">Submit</Button>
      </Stack>
    </form>
    <Text variant="caption">With onClick handler:</Text>
    <Button variant="secondary" onClick={() => alert("Clicked!")}>
      Click me
    </Button>
  </Stack>
);
