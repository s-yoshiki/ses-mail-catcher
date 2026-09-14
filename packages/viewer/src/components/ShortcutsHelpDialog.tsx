import type { JSX } from 'react';
import { Button, Dialog, DialogTrigger, Modal, ModalOverlay } from 'react-aria-components';

export interface ShortcutsHelpDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const SHORTCUTS: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: 'j / k', description: 'Select the next / previous message' },
  { keys: '/', description: 'Focus the search field' },
  { keys: 'r', description: 'Refresh the message list' },
  { keys: 'Delete', description: 'Delete the selected message' },
  { keys: 'Escape', description: 'Clear the search, or return to the message list' },
  { keys: '?', description: 'Show this help' },
];

/** The toolbar's "?" button and its keyboard-shortcuts reference dialog. */
export const ShortcutsHelpDialog = (props: ShortcutsHelpDialogProps): JSX.Element => {
  return (
    <DialogTrigger isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Button type="button" className="icon-button" aria-label="Keyboard shortcuts">?</Button>
      <ModalOverlay className="modal-overlay">
        <Modal className="modal">
          <Dialog className="dialog" aria-label="Keyboard shortcuts">
            {({ close }) => (
              <>
                <h2 className="dialog-title">Keyboard shortcuts</h2>
                <div className="shortcuts-list">
                  {SHORTCUTS.map((item) => (
                    <div className="shortcuts-row" key={item.keys}>
                      <kbd>{item.keys}</kbd>
                      <span>{item.description}</span>
                    </div>
                  ))}
                </div>
                <div className="dialog-actions">
                  <Button type="button" onPress={close}>Close</Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
};
