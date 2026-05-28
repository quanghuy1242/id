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
      className="modal modal-open bg-black/40 data-[entering]:animate-modal-overlay-in data-[exiting]:animate-modal-overlay-out"
    >
      <Modal className="modal-box data-[entering]:animate-modal-panel-in data-[exiting]:animate-modal-panel-out">
        <Dialog className="outline-none">
          {({ close }) => (
            <>
              <DialogHeading slot="title" className="font-bold text-lg">
                {title}
              </DialogHeading>
              {description && (
                <p className="py-4 text-base-content/70">{description}</p>
              )}
              {children && <div className="flex flex-col gap-3 py-2">{children}</div>}
              <div className="modal-action">
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
