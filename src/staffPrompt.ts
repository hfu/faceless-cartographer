import { readFileSync } from 'node:fs';

const SOURCE_URL = 'https://raw.githubusercontent.com/hfu/layers-martin/main/STAFF_PROMPT.md';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK = readFileSync(new URL('./staff-prompt-fallback.txt', import.meta.url), 'utf-8');

let cached: { text: string; fetchedAt: number } | null = null;

// GET / shows "the current best Staff prompt" (hfu/layers-martin's
// STAFF_PROMPT.md), fetched live so it doesn't silently drift from the
// canonical source the way a hand-embedded copy would. Cached briefly to
// avoid hitting GitHub on every request; falls back to the bundled snapshot
// (staff-prompt-fallback.txt) if the fetch fails, so GET / never breaks just
// because GitHub is unreachable.
export async function getStaffPromptMarkdown(): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text;
  }
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    cached = { text, fetchedAt: Date.now() };
    return text;
  } catch (e) {
    console.error('Could not fetch live STAFF_PROMPT.md; using bundled fallback.', e);
    return FALLBACK;
  }
}
