import type { JSX } from 'react';

export interface ToolbarProps {
  readonly messageCount: number;
  readonly autoRefresh: boolean;
  readonly onAutoRefreshChange: (enabled: boolean) => void;
  readonly onRefresh: () => void;
}

export const Toolbar = (props: ToolbarProps): JSX.Element => {
  return (
    <header className="toolbar">
      <h1 className="toolbar-title">ses-mail-catcher</h1>

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
};
