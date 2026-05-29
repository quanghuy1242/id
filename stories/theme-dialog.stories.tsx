import { Button, ThemeDialog } from "@id/ui";
import { useState } from "react";
import type { Story } from "@ladle/react";

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
