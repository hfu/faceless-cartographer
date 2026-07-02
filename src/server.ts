import express from 'express';
import { parseMapIntent } from './mapIntent.ts';
import { resolveLayers } from './catalog.ts';
import { buildStyle, computeInitialView } from './style.ts';
import { renderFormPage, renderMapPage } from './render.ts';

const app = express();

// Data minimization (unopengis/staccato-spec ADR 0001 §4): don't log raw
// Map Intent payloads. Express's default request logging is off unless a
// logging middleware is added -- deliberately not adding one that would
// capture bodies.
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.use((_req, res, next) => {
  // Faceless Cartographer baseline (ADR 0001): avoid leaking context via the
  // Referer header on outbound requests triggered from this page (e.g. tile
  // fetches, external links).
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// GET / -- the only public interactive endpoint (ADR 0001). No other route
// carries map state; this always returns the same form.
app.get('/', (_req, res) => {
  res.type('html').send(renderFormPage());
});

// POST / -- accepts a posted Map Intent and renders the map. Never persisted
// beyond this request/response cycle.
app.post('/', async (req, res) => {
  const rawIntent = typeof req.body?.map_intent === 'string' ? req.body.map_intent : '';

  const parsed = parseMapIntent(rawIntent);
  if (!parsed.ok) {
    res.status(400).type('html').send(renderFormPage({ prefill: rawIntent, error: parsed.error }));
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

  res.type('html').send(
    renderMapPage({ rawIntent, intent, view, style, resolved, missing, unrenderable, urlShareWarning })
  );
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`faceless-cartographer listening on http://localhost:${port}`);
});
