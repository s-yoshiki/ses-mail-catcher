import type { JSX } from 'react';
import { Button, Dialog, DialogTrigger, Modal, ModalOverlay } from 'react-aria-components';

export interface DeleteAllDialogProps {
  readonly messageCount: number;
  readonly disabled: boolean;
  readonly isDeleting: boolean;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

/**
 * The toolbar's "Delete all" button and its confirmation dialog. The dialog
 * closes immediately on confirm; `onConfirm` (provided by the router, where
 * the mutation lives) is responsible for the toast and navigating to `/`.
 */
export const DeleteAllDialog = (props: DeleteAllDialogProps): JSX.Element => {
  const label = `${props.messageCount} ${props.messageCount === 1 ? 'message' : 'messages'}`;

  return (
    <DialogTrigger isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Button type="button" className="button-destructive" isDisabled={props.disabled || props.isDeleting}>
        Delete all
      </Button>
      <ModalOverlay className="modal-overlay">
        <Modal className="modal">
          <Dialog role="alertdialog" className="dialog" aria-label={`Delete all ${label}?`}>
            {({ close }) => (
              <>
                <h2 className="dialog-title">Delete all messages?</h2>
                <p className="dialog-body">
                  This permanently deletes {label}. This cannot be undone.
                </p>
                <div className="dialog-actions">
                  <Button type="button" onPress={close}>Cancel</Button>
                  <Button
                    type="button"
                    className="button-destructive"
                    onPress={() => {
                      close();
                      props.onConfirm();
                    }}
                  >
                    Delete all
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
};
