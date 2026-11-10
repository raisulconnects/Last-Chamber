import raw from '../CHANGELOG.md?raw';

export interface ChangelogItem {
  tag: string; // Added / Changed / Fixed ...
  text: string;
}
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: ChangelogItem[];
}

/** Parses the Keep-a-Changelog style file. Unknown lines are ignored; empty input gives []. */
export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let cur: ChangelogEntry | null = null;
  let tag = '';
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s*\[([^\]]+)\]\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?\s*(?:-\s*(.*))?$/.exec(line);
    if (h) {
      cur = { version: h[1], date: h[2] ?? '', title: (h[3] ?? '').trim(), items: [] };
      entries.push(cur);
      tag = '';
      continue;
    }
    const t = /^###\s+(.+)$/.exec(line);
    if (t) {
      tag = t[1].trim();
      continue;
    }
    const b = /^\s*-\s+(.+)$/.exec(line);
    if (b && cur) cur.items.push({ tag, text: b[1].trim() });
  }
  return entries;
}

export const CHANGELOG: ChangelogEntry[] = parseChangelog(raw);
