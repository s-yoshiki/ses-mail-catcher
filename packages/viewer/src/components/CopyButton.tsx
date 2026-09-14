import type { JSX } from 'react';
import { Button } from 'react-aria-components';
import { toast } from 'sonner';

export interface CopyButtonProps {
  readonly text: string;
  /** Accessible name, e.g. `"Copy To address"`. */
  readonly label: string;
}

/** Copies `text` to the clipboard on press, confirmed (or reported) with a toast. */
export const CopyButton = ({ text, label }: CopyButtonProps): JSX.Element => {
  const handlePress = (): void => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Could not copy to clipboard'),
    );
  };

  return (
    <Button type="button" className="icon-button copy-button" aria-label={label} onPress={handlePress}>
      Copy
    </Button>
  );
};
