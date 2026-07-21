import { parseMapIntent } from './mapIntent.ts';
import { resolveLayers, resolveStyles } from './catalog.ts';
import { buildStyle, computeInitialView } from './style.ts';
import { renderFormView, renderMapView } from './render.ts';
import { decodeIntentFragment } from './fragment.ts';
// Fetched at build time (scripts/fetch-staff-prompt.mjs), bundled as a plain
// string -- see DECISIONS.md D19. No runtime dependency on GitHub for a
// static, offline-servable page.
import staffPromptMarkdown from './staff-prompt.txt?raw';

const app = document.getElementById('app');
if (!app) throw new Error('#app root element not found');

function showForm(opts: { prefill?: string; error?: string } = {}) {
  renderFormView(app!, { ...opts, staffPromptMarkdown, onSubmit: handleSubmit });
}

async function handleSubmit(rawIntent: string): Promise<void> {
  const parsed = parseMapIntent(rawIntent);
  if (!parsed.ok) {
    showForm({ prefill: rawIntent, error: parsed.error });
    return;
  }

  const { intent } = parsed;
  const [{ resolved, missing: missingLayers }, { resolved: resolvedStyles, missing: missingStyles }] = await Promise.all([
    resolveLayers(intent),
    resolveStyles(intent)
  ]);
  // D39: style misses are folded into the same missing/unrenderable arrays
  // as layer misses -- one cartographer_feedback shape, no separate
  // missing_styles/unrenderable_styles sibling fields.
  const missing = [...missingLayers, ...missingStyles];
  const { style, unrenderable, styleLayerIds } = buildStyle(intent, resolved, resolvedStyles);
  const view = computeInitialView(intent, resolved);

  renderMapView(app!, {
    rawIntent,
    intent,
    view,
    style,
    resolved,
    resolvedStyles,
    styleLayerIds,
    missing,
    unrenderable,
    onBack: () => showForm()
  });
}

// D32: a URL fragment (#intent=...) is a one-shot hand-off channel, never
// sent to the server. Read at most once here and cleared *before* rendering
// (handleSubmit is async, so clearing after would leave a window where a
// copied URL still carries the raw intent) -- so a rendered session's URL
// is always clean, same as ADR 0001 requires for any other path.
function bootstrap(): void {
  const decoded = decodeIntentFragment(location.hash);
  if (decoded !== null) {
    history.replaceState(null, '', location.pathname + location.search);
    handleSubmit(decoded);
    return;
  }
  showForm();
}

bootstrap();
