import { parseMapIntent } from './mapIntent.ts';
import { resolveLayers } from './catalog.ts';
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
  const { resolved, missing } = await resolveLayers(intent);
  const { style, unrenderable } = buildStyle(intent, resolved);
  const view = computeInitialView(intent, resolved);
  // map-intent-vnext.md §6-5: sharing_policy.url_share SHOULD be false in
  // faceless Cartographer deployments (this one always is -- ADR 0001). Not
  // a MUST, so a non-compliant intent is still rendered; just flagged.
  const urlShareWarning = intent.sharing_policy?.url_share === true;

  renderMapView(app!, {
    rawIntent,
    intent,
    view,
    style,
    resolved,
    missing,
    unrenderable,
    urlShareWarning,
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
