import { Button, ThemeDialog } from "@id/ui";
import { useState } from "react";
import type { Story, StoryDefault } from "@ladle/react";

export default { title: "Packages UI / Theme Dialog" } satisfies StoryDefault;

export const Open: Story = () => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open Theme Dialog
      </Button>
      <ThemeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
};
