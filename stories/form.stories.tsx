import { Checkbox, Form, RadioGroup, Stack, Text } from "@idco/ui";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Form" } satisfies StoryDefault;

const radioOptions = [
  { value: "cat", label: "Cat" },
  { value: "dog", label: "Dog" },
  { value: "dragon", label: "Dragon" },
] as const;

export const RadioSizes: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Radio Group — md (default)</Text>
    <RadioGroup title="Favorite pet" name="pet-md" options={radioOptions} defaultValue="cat" />

    <Text variant="h2">Radio Group — sm</Text>
    <RadioGroup title="Favorite pet" name="pet-sm" options={radioOptions} defaultValue="dog" size="sm" />
  </Stack>
);

export const RadioError: Story = () => (
  <RadioGroup title="Choose one" name="choose" options={radioOptions} error="You must pick an option." />
);

export const CheckboxSizes: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Checkbox — md (default)</Text>
    <Checkbox label="Accept terms" name="terms-md" value="yes" />

    <Text variant="h2">Checkbox — sm</Text>
    <Checkbox label="Accept terms" name="terms-sm" value="yes" size="sm" />
  </Stack>
);

export const CheckboxStates: Story = () => (
  <Stack gap="md">
    <Text variant="h2">Unchecked</Text>
    <Checkbox label="Subscribe to newsletter" name="news" value="yes" />

    <Text variant="h2">Selected (controlled)</Text>
    <Checkbox label="Accept terms" name="terms" value="yes" selected />

    <Text variant="h2">Indeterminate</Text>
    <Checkbox label="Select all items" name="select-all" value="all" indeterminate />

    <Text variant="h2">Error</Text>
    <Checkbox label="Accept terms" name="terms-err" value="yes" error="Required" />
  </Stack>
);

export const InForm: Story = () => (
  <Form
    onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      alert(
        `Radio: ${data.get("pet") ?? "none"} | Checkbox: ${data.get("terms") ? "checked" : "unchecked"}`,
      );
    }}
  >
    <Stack gap="md" align="start">
      <RadioGroup title="Favorite pet" name="pet" options={radioOptions} required />
      <Checkbox label="Accept terms" name="terms" value="yes" required />
      <button type="submit" className="btn btn-primary">
        Submit
      </button>
    </Stack>
  </Form>
);
