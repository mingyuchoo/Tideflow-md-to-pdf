export function deriveAltFromPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';

  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const lastSegment = segments[segments.length - 1] || '';
  const [basename] = lastSegment.split('?');
  if (!basename) return '';

  const withoutExt = basename.replace(/\.[^.]+$/, '');
  let decoded = withoutExt;
  try {
    decoded = decodeURIComponent(withoutExt);
  } catch {
    // ignore decoding issues, fall back to raw string
  }

  const collapsed = decoded.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';

  return collapsed
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}
