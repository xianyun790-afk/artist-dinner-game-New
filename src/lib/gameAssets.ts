const base = import.meta.env?.BASE_URL ?? '/';

export function gameAsset(path: string) {
  return path.startsWith('/') && !path.startsWith('//') ? base + path.slice(1) : path;
}
