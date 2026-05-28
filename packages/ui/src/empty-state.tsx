// DaisyUI 5: https://daisyui.com/components/hero/
import { Inbox } from "lucide-react";
import { Button } from "./button";

type EmptyStateProps = {
  readonly message: string;
  readonly cta?: string;
  readonly onCta?: () => void;
};

export function EmptyState({ message, cta, onCta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-base-content/50">
      <Inbox className="h-10 w-10" aria-hidden="true" />
      <p className="text-sm">{message}</p>
      {cta && onCta && (
        <Button variant="primary" onClick={onCta}>
          {cta}
        </Button>
      )}
    </div>
  );
}
