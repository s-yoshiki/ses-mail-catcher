import type { JSX } from 'react';

import { CopyButton } from './CopyButton.js';

export interface LinksListProps {
  readonly links: string[];
}

/** The Links tab's content: every unique `http:`/`https:` URL found in the message, each with a copy button and an "Open" link. */
export const LinksList = ({ links }: LinksListProps): JSX.Element => {
  if (links.length === 0) {
    return <p className="placeholder">No links found.</p>;
  }

  return (
    <ul className="links-list">
      {links.map((url) => (
        <li key={url} className="links-list-row">
          <span className="links-list-url">{url}</span>
          <span className="links-list-actions">
            <CopyButton label={`Copy ${url}`} text={url} />
            {/* Untrusted mail content: `noopener noreferrer` keeps the opened
                tab from reaching back into this one and keeps this URL out
                of the destination's referrer. */}
            <a className="button-link" href={url} target="_blank" rel="noopener noreferrer">Open</a>
          </span>
        </li>
      ))}
    </ul>
  );
};
