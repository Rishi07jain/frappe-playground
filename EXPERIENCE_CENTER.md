# ERPNext Experience Center (on Frappe Playground)

This branch turns Frappe Playground into the ERPNext Experience Center: a real ERPNext v16
desk running in the browser, with sample data, an edit guard that sends visitors to the
free trial, and the 17 guided tours from the Experience Center artifact.

Upstream: [lubusIN/frappe-playground](https://github.com/lubusIN/frappe-playground) (MIT).
The playground's own code is left in place; everything new is switched by one flag.

## Run it

You need Node 20+ and Docker (Docker is only for the one-time runtime build).

```bash
npm install
npm run build:runtime   # one time: builds Frappe + ERPNext for the browser (long, several GB)
npm run dev             # http://localhost:5173/
```

The first visit installs ERPNext into the browser, runs setup for **Demo Industries Pvt Ltd**
(Maharashtra, INR, Indian fiscal year) and loads the sample data. That takes a few
minutes and the loading screen shows two extra steps for it: *Setting up ERPNext* and
*Loading sample data*. Later visits reuse the browser copy and only sign in.

To get the plain playground back, build with `VITE_EXPERIENCE_CENTER=false`.

## Deploy

`.github/workflows/deploy.yml` builds the runtime (Docker, on the GitHub runner), the
client and the docs, then publishes `dist` to Cloudflare Pages on every push to `main` or
`experience-center`. In the fork's **Settings › Secrets and variables › Actions** add:

- secrets `CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`;
- optionally the variable `CLOUDFLARE_PAGES_PROJECT` (defaults to `frappe-playground`).

Pushes to `main` go to the production URL, other branches to `<branch>.<project>.pages.dev`.
The Experience Center e2e spec runs before publishing and its report is uploaded as the
`playwright-report` artifact; a failing spec does not block the deploy.

## What a visitor sees

- **Top bar (54 px):** window dots and "Live demo · sample data" on the left (hidden under
  1100 px), "Frappe Experience Center" centred in Inter 600 16 px, and on the right
  Guided tours, Reset, Feedback, a light/dark toggle and Start free trial.
- **Welcome note:** once per browser session, the same text as the artifact, one
  "Start exploring" button.
- **The desk:** real ERPNext v16 (Frappe 16.54, ERPNext 16.53), signed in as
  Administrator. Browsing works everywhere.
- **Edit guard:** opening any form (new, existing or a settings page), a quick-entry
  dialog, or any write (save, submit, delete, rename, bulk edit, comments, tags,
  assignments, imports, uploads, workspace edits) shows "This works in your free trial"
  with Go back and Start free trial. Escape also goes back. The guard is off while a tour runs.
- **Guided tours menu:** 620 px panel, module tabs with done counts, each tour with title,
  one line and Start. Closes on Escape or an outside click; disabled while a tour runs;
  tabs become a row on phones.
- **A tour:** opens the module, spotlights the sidebar, then plays each step with a moving
  cursor on the real desk and waits for Next. The end card has a 1–5 rating, an optional
  comment, Start free trial, Back to Dashboard and Close.
- **Reset:** clears this browser's copy and sets the sample company up again.
- **Feedback:** saved in the browser (`localStorage.ec_feedback`). Set
  `EXPERIENCE_CENTER.feedbackUrl` in `packages/client/src/playground/config.js` to also POST
  each response as JSON (for example to a Frappe Web Form endpoint).

## How it works

| Piece | File | What it does |
| --- | --- | --- |
| Flag and settings | `packages/client/src/playground/config.js` | `EXPERIENCE_CENTER`: on/off, trial URL, landing path, shown modules, feedback URL |
| Boot | `packages/client/src/experience/boot.js` | After the runtime is ready: install ERPNext if missing, sign in, run setup with the company slide, run each seed stage |
| Lifecycle hook | `packages/client/src/composables/use-playground-lifecycle.js` | Calls the boot above and adds its two loading steps |
| Sample data | `runtime/python/experience_center.py` | Whitelisted `status()` and `seed(stage)`; six idempotent stages: masters, stock, selling, buying, manufacturing, assets |
| Worker wiring | `scripts/generate-python-sources.mjs`, `packages/server/src/request-handler.js`, `packages/server/src/index.js` | Bundles the seed module and writes it into the `frappe` package at worker start, so it is callable as `/api/method/frappe.experience_center.*` (Frappe only resolves methods under an installed app) |
| Shell UI | `packages/client/src/experience/ExperienceBar.vue`, `ExperienceDialogs.vue`, `use-experience.js`, `App.vue` | Top bar, tours menu, welcome/feedback/reset dialogs, theme, messages from the desk |
| Desk injection | `packages/client/src/experience/inject.js` | Adds the desk scripts and CSS to each desk page in the iframe (same origin) |
| Desk: guard + overlay | `packages/client/src/experience/desk/core.js` | Edit guard (wraps `frappe.request.call` and `frappe.ui.form.make_quick_entry`, watches the router), cursor, spotlight, step card, theme |
| Desk: tours | `packages/client/src/experience/desk/tours.js` | The 17 tours as steps, using real v16 fieldnames and menu labels |
| Desk: driver | `packages/client/src/experience/desk/driver.js` | Plays steps through Frappe's own APIs, Next/Back, errors, end card |
| Tour list | `packages/client/src/experience/catalog.js` | Tour titles and one-liners for the menu; shared with the desk |

Nothing in Frappe or ERPNext is modified. The desk code wraps two public functions at
runtime and reads the DOM Frappe renders (`.body-sidebar a.item-anchor`,
`.page-actions .primary-action`, list rows `a[data-name]`, the Create menu's
`.inner-group-button[data-label]` store).

### Sample data

Company Demo Industries Pvt Ltd (DI) in Maharashtra, with HDFC Bank. Customers Sharma
Garments (MH), Kaveri Textiles (TN), Patel Fashion House (GJ), Deccan Retail Co. (TS) and
Walk In Customer; suppliers Gujarat Yarn Mills (GJ), Shree Dyes & Chemicals (MH),
Coimbatore Cotton Co. (TN); the seven textile items plus a service item; three
fixed-asset items, three locations, three employees.

GST works through core ERPNext: output and input CGST/SGST/IGST accounts, In-State and
Out-State tax categories on each party, four tax templates, four Tax Rules that pick the
template from the party's category, and GST 5% / 18% item tax templates. So a customer in
Tamil Nadu gets IGST and one in Maharashtra gets CGST + SGST, on their own.

Each tour that continues earlier work starts from a seeded document when there is no
newer one: an unpaid invoice, an open purchase order, an unbilled receipt, an open
quotation, an undelivered sales order, a submitted asset, an active BOM and a work order
ready to finish.

## Changes to the tour copy

Plain ERPNext has no India Compliance app, so a few artifact lines described fields that
don't exist here. Only those lines changed:

- **Sales invoice, customer step:** "billing address, GSTIN and payment terms" →
  "billing address and tax category".
- **Sales invoice, submit:** the e-invoice IRN mention is dropped.
- **Print steps (invoice, quotation):** "An A4, GST-ready …" → "The invoice/quotation,
  ready to send", since the standard print format has no IRN, QR or HSN summary.
- **Quotation, taxes:** "Tax on each item from its HSN" → "at its own GST rate".
- **Add an item:** the HSN step becomes **Choose its GST rate** (Item Tax Template).
- **Journal entry:** debit and credit are two account rows in the real form; a **Note the
  bank reference** step is added because a Bank Entry needs a reference number and date.
- **Purchase order, email:** one step that opens the real composer and closes it; nothing
  is sent from the sandbox.
- **Register a fixed asset:** a **Turn on depreciation** step, then the depreciation row
  (Straight Line, 36 months).
- **Move an asset:** it goes through **Actions › Transfer Asset**, and location and
  custodian are set on the asset's row.
- **Work order:** ERPNext asks for the quantity in a dialog; a **Use materials straight
  from Stores** step (Skip Material Transfer) is added so the next tour can finish it.
- **Finish production:** uses the work order's **Finish** button.
- **Back:** goes back one step while you're still filling the same unsaved form. After a
  save, submit or page change it is off, because a real document can't be un-saved.

## Tests

- `node --test tests/contract/experience-center.test.mjs`: every menu tour has steps, the
  guard's write/read split, setup arguments, and the seed module export. Runs without
  `npm install`.
- `npx playwright test tests/e2e/experience_center.spec.js --project=chromium`: boots
  the real ERPNext, checks the top bar, the guard on forms and writes, runs all 17 tours
  start to finish, then checks counts and feedback.
- The upstream e2e suite expects the plain playground: run it with a
  `VITE_EXPERIENCE_CENTER=false` build.

## Not yet verified against the real runtime

All of this was written and checked without running Frappe in a browser. The desk scripts
were run against a stand-in for `frappe.*`, the seed and tour fields were checked
against the v16 doctype definitions, and the contract tests pass. The first real run
is still where these could surface:

- a seed stage failing on a validation (the loading screen shows the error and
  Retry boot);
- a tour step whose DOM target differs, for example the Create menu's rendered items or
  the print button; the step card then says what failed, with Try again and Skip;
- the asset depreciation row's validations.

## Ideas for later

- Add the India Compliance app to `runtime/apps/catalog.json`, to bring back GSTIN, HSN,
  e-invoice and the GST print format, and restore the original tour lines.
- Port the hidden-module tours from the artifact (Quality, Projects, Support, CRM, POS) and
  list those modules in `tourModules`.
- A boot-time `?company=` option to rebuild the sample data around a visitor's company.
