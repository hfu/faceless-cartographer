#!/usr/bin/env node
// Runs as a `prebuild` step (see package.json / Justfile). Refreshes
// src/staff-prompt.txt from the live hfu/layers-martin STAFF_PROMPT.md so
// the static build shows an up-to-date Staff prompt (DECISIONS.md D19)
// without the app itself needing a runtime fetch. On failure, leaves the
// existing file untouched -- a stale-but-valid snapshot from the last
// successful fetch is better than breaking the build over a transient
// network problem.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/hfu/layers-martin/main/STAFF_PROMPT.md';
const TARGET = fileURLToPath(new URL('../src/staff-prompt.txt', import.meta.url));

try {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  await writeFile(TARGET, text, 'utf-8');
  console.log(`fetch-staff-prompt: updated ${TARGET} from ${SOURCE_URL}`);
} catch (e) {
  console.error(`fetch-staff-prompt: could not fetch ${SOURCE_URL}, keeping existing snapshot.`, e);
}
