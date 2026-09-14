import type { JSX, ReactNode } from 'react';

/**
 * Small inline SVGs for the attachment type icon, grouped by broad MIME
 * category rather than exact type — no icon library, just enough visual
 * distinction to scan a list of attachments. `aria-hidden` because the
 * filename next to each icon already carries the accessible information.
 */

const IconBase = ({ children }: { children: ReactNode }): JSX.Element => (
  <svg
    className="attachment-icon"
    viewBox="0 0 20 20"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const GenericFileIcon = (): JSX.Element => (
  <IconBase>
    <path d="M5 2.5h6.5L15 6v11.5H5z" />
    <path d="M11.5 2.5V6H15" />
  </IconBase>
);

const ImageIcon = (): JSX.Element => (
  <IconBase>
    <rect x="3" y="4" width="14" height="12" rx="1.2" />
    <circle cx="7.2" cy="8" r="1.2" fill="currentColor" stroke="none" />
    <path d="M4 14.5 8 10l3 3 2-2 3 3.5" />
  </IconBase>
);

const PdfIcon = (): JSX.Element => (
  <IconBase>
    <path d="M5 2.5h6.5L15 6v11.5H5z" />
    <path d="M11.5 2.5V6H15" />
    <path d="M7 14v-3.5h.9c.6 0 1 .4 1 1s-.4 1-1 1H7" />
    <path d="M10.5 14v-3.5" />
  </IconBase>
);

const ArchiveIcon = (): JSX.Element => (
  <IconBase>
    <rect x="3.5" y="4" width="13" height="12" rx="1" />
    <path d="M3.5 7.5h13" />
    <path d="M9 10v3" />
  </IconBase>
);

const AudioIcon = (): JSX.Element => (
  <IconBase>
    <path d="M7 13.5V5.5l7-2v8" />
    <circle cx="5.5" cy="14" r="1.8" />
    <circle cx="12.5" cy="12" r="1.8" />
  </IconBase>
);

const VideoIcon = (): JSX.Element => (
  <IconBase>
    <rect x="3" y="5" width="10" height="10" rx="1.2" />
    <path d="M13 8.5 17 6v8l-4-2.5z" />
  </IconBase>
);

const TextIcon = (): JSX.Element => (
  <IconBase>
    <path d="M5 2.5h6.5L15 6v11.5H5z" />
    <path d="M11.5 2.5V6H15" />
    <path d="M7 10.5h6M7 13.5h6" />
  </IconBase>
);

/** Picks an icon by broad MIME category; falls back to a generic file icon. */
export const attachmentTypeIcon = (contentType: string): JSX.Element => {
  const type = contentType.toLowerCase();

  if (type.startsWith('image/')) {
    return <ImageIcon />;
  }
  if (type === 'application/pdf') {
    return <PdfIcon />;
  }
  if (type.startsWith('audio/')) {
    return <AudioIcon />;
  }
  if (type.startsWith('video/')) {
    return <VideoIcon />;
  }
  if (
    type === 'application/zip'
    || type === 'application/x-zip-compressed'
    || type === 'application/x-7z-compressed'
    || type === 'application/x-rar-compressed'
    || type === 'application/x-tar'
    || type === 'application/gzip'
  ) {
    return <ArchiveIcon />;
  }
  if (type.startsWith('text/') || type === 'application/json' || type === 'application/xml') {
    return <TextIcon />;
  }
  return <GenericFileIcon />;
};
