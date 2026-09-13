/** Bounds the viewer list size before it reaches the storage implementation. */
export const parseLimit = (value: string | null): number => {
  const limit = Number.parseInt(value ?? '100', 10);
  return Number.isNaN(limit) ? 100 : limit;
};

/** Creates a safe attachment disposition while preserving the UTF-8 filename. */
export const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};
