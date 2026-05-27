"use client";

// DaisyUI 5: https://daisyui.com/components/modal/
// React Aria: https://react-spectrum.adobe.com/react-aria/Dialog.html
import type { ReactNode } from "react";
import {
  Dialog,
  Modal,
  ModalOverlay,
  Heading as DialogHeading,
} from "react-aria-components";
import { Button } from "./button";

type ConfirmDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: "primary" | "danger";
  readonly onConfirm: () => void;
  readonly confirmDisabled?: boolean;
  readonly children?: ReactNode;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  onConfirm,
  confirmDisabled,
  children,
}: ConfirmDialogProps) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <Modal className="bg-base-100 border border-base-300 rounded-box shadow-xl w-full max-w-md mx-4 p-6">
        <Dialog className="outline-none flex flex-col gap-4">
          {({ close }) => (
            <>
              <DialogHeading
                slot="title"
                className="text-lg font-semibold text-base-content"
              >
                {title}
              </DialogHeading>
              {description && (
                <p className="text-sm text-base-content/70">{description}</p>
              )}
              {children && <div className="flex flex-col gap-3">{children}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={close}>
                  {cancelLabel}
                </Button>
                <Button
                  variant={variant === "danger" ? "danger" : "primary"}
                  disabled={confirmDisabled}
                  onClick={() => {
                    onConfirm();
                    close();
                  }}
                >
                  {confirmLabel}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
