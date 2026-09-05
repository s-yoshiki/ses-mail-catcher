import type { JSX } from 'react';

export interface ToolbarProps {
  readonly mailbox: string;
  readonly mailboxes: string[];
  readonly messageCount: number;
  readonly autoRefresh: boolean;
  readonly onMailboxChange: (mailbox: string) => void;
  readonly onAutoRefreshChange: (enabled: boolean) => void;
  readonly onRefresh: () => void;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  return (
    <header className="toolbar">
      <h1 className="toolbar-title">ses-mail-catcher</h1>

      <label className="toolbar-field">
        <span>Mailbox</span>
        <select
          value={props.mailbox}
          onChange={(event) => props.onMailboxChange(event.target.value)}
        >
          <option value="">All</option>
          {props.mailboxes.map((mailbox) => (
            <option key={mailbox} value={mailbox}>{mailbox}</option>
          ))}
        </select>
      </label>

      <span className="toolbar-count">
        {props.messageCount} {props.messageCount === 1 ? 'message' : 'messages'}
      </span>

      <label className="toolbar-field toolbar-checkbox">
        <input
          type="checkbox"
          checked={props.autoRefresh}
          onChange={(event) => props.onAutoRefreshChange(event.target.checked)}
        />
        <span>Auto refresh</span>
      </label>

      <button type="button" onClick={props.onRefresh}>Refresh</button>
    </header>
  );
}
