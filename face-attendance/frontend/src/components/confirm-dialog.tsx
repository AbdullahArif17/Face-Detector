"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel = "Working...",
  isConfirming = false,
  destructive = false,
  onOpenChange,
  onConfirm,
}: Readonly<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  isConfirming?: boolean;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}>) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isConfirming) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(event) => {
          if (isConfirming) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (isConfirming) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-pretty leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 pt-2 sm:flex sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={isConfirming}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={
              destructive
                ? "w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
                : "w-full sm:w-auto"
            }
            disabled={isConfirming}
            onClick={onConfirm}
          >
            {isConfirming ? busyLabel : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
