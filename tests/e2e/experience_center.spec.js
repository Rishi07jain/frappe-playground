// End-to-end checks for the ERPNext Experience Center against the real ERPNext runtime.
// Run on its own (it needs the default build, with the Experience Center on):
//   npx playwright test tests/e2e/experience_center.spec.js --project=chromium
// The first boot installs ERPNext, runs setup and loads the sample data, so allow time.
const { test, expect } = require('@playwright/test');

const TOURS = [
  ['Accounting', 'Create a sales invoice'],
  ['Accounting', 'Record a customer payment'],
  ['Accounting', 'Post a journal entry'],
  ['Buying', 'Create a purchase order'],
  ['Buying', 'Receive goods against the order'],
  ['Buying', 'Book the supplier’s bill'],
  ['Selling', 'Send a quotation'],
  ['Selling', 'Turn a quotation into a sales order'],
  ['Selling', 'Deliver the order'],
  ['Stock', 'Add an item'],
  ['Stock', 'Receive stock into a warehouse'],
  ['Stock', 'Move stock between warehouses'],
  ['Assets', 'Register a fixed asset'],
  ['Assets', 'Move an asset to another location'],
  ['Manufacturing', 'Create a bill of materials'],
  ['Manufacturing', 'Plan production with a work order'],
  ['Manufacturing', 'Finish production'],
];

// Not serial: a failing tour must not skip the rest. After a failure Playwright starts a
// fresh worker, and beforeAll boots the Experience Center again. No retries, so every
// tour gets exactly one honest run.
test.describe.configure({ mode: 'default', retries: 0 });

/** @type {import('@playwright/test').Page} */
let page;
const errors = [];

function desk() {
  return page.frameLocator('#frappe-desk');
}

async function deskFrame() {
  const handle = await page.locator('#frappe-desk').elementHandle();
  return handle.contentFrame();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(1800000);
  page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  // Print boot progress and errors to the CI log, so a stuck boot shows where it stopped.
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' || /experience|seed|setup|install|boot/i.test(t)) console.log(`[browser:${m.type()}] ${t.slice(0, /WSGI 500|Traceback/.test(t) ? 8000 : 500)}`);
  });
  let lastStep = '';
  const timer = setInterval(async () => {
    try {
      const txt = (await page.locator('#loading-screen').innerText({ timeout: 2000 })).replace(/\s+/g, ' ').slice(0, 400);
      if (txt !== lastStep) { lastStep = txt; console.log(`[loading-screen] ${txt}`); }
    } catch {}
  }, 15000);
  await page.goto('/');
  await expect(page.locator('.ec-bar')).toBeVisible();
  try {
    await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 1500000 });
  } finally {
    clearInterval(timer);
  }
  await expect(page.locator('#frappe-desk')).toBeVisible();
  // The welcome note appears once the desk is ready.
  await expect(page.getByText('Welcome to the ERPNext Experience Center')).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Start exploring' }).click();
});

test.afterAll(async () => {
  await page?.close();
});

test('top bar shows the Experience Center controls', async () => {
  await expect(page.locator('.ec-bar-title')).toHaveText('Frappe Experience Center');
  for (const name of ['Guided tours', 'Reset', 'Feedback']) {
    await expect(page.locator('.ec-bar').getByRole('button', { name })).toBeVisible();
  }
  await expect(page.locator('.ec-bar').getByRole('link', { name: 'Start free trial' }))
    .toHaveAttribute('href', /frappecloud\.com\/dashboard\/signup\?product=erpnext/);
  // The playground's own dock is not shown.
  await expect(page.locator('input[aria-label="Current Frappe path"]')).toHaveCount(0);
});

test('opening any form shows the free-trial card instead', async () => {
  const frame = await deskFrame();
  await frame.evaluate(() => frappe.set_route('Form', 'Customer', 'Kaveri Textiles'));
  await expect(desk().locator('.ec-guard.is-on')).toBeVisible({ timeout: 15000 });
  await expect(desk().locator('.ec-guard')).toContainText('This works in your free trial');
  await desk().getByRole('button', { name: 'Go back' }).click();
  await expect(desk().locator('.ec-guard.is-on')).toHaveCount(0);
  expect(await frame.evaluate(() => frappe.get_route()[0])).toBe('List');

  await frame.evaluate(() => frappe.new_doc('Sales Invoice'));
  await expect(desk().locator('.ec-guard.is-on')).toBeVisible({ timeout: 15000 });
  await desk().getByRole('button', { name: 'Go back' }).click();
});

test('write calls are refused outside a tour', async () => {
  const frame = await deskFrame();
  const result = await frame.evaluate(() => new Promise(resolve => {
    frappe.call({ method: 'frappe.client.set_value', args: { doctype: 'Customer', name: 'Kaveri Textiles', fieldname: 'customer_group', value: 'Individual' } })
      .then(() => resolve('saved'), () => resolve('refused'));
  }));
  expect(result).toBe('refused');
  await desk().getByRole('button', { name: 'Go back' }).click();
});

for (const [module, title] of TOURS) {
  test(`tour: ${title}`, async () => {
    await page.locator('.ec-bar').getByRole('button', { name: 'Guided tours' }).click();
    await page.locator('.ec-menu').getByRole('tab', { name: new RegExp(`^${module}`) }).click();
    const row = page.locator('.ec-tour', { hasText: title });
    await row.getByRole('button', { name: /Start/ }).click();

    for (let i = 0; i < 40; i++) {
      const next = desk().locator('.ec-tip [data-ec="next"]:not([disabled])');
      const doneCard = desk().locator('.ec-done');
      const failed = desk().locator('.ec-tip-error');
      try {
        await expect(next.or(doneCard).or(failed)).toBeVisible({ timeout: 120000 });
      } catch (e) {
        // Say where the tour was stuck: the step card (if any), its Next state and the route.
        const tip = desk().locator('.ec-tip');
        const tipText = (await tip.count()) ? (await tip.first().innerText()).replace(/\s+/g, ' ') : '(no step card)';
        const nextState = (await desk().locator('.ec-tip [data-ec="next"]').count())
          ? ((await desk().locator('.ec-tip [data-ec="next"]').first().isDisabled()) ? 'Next disabled' : 'Next enabled')
          : 'no Next button';
        const route = await (await deskFrame()).evaluate(() => (window.frappe && frappe.get_route_str && frappe.get_route_str()) || location.pathname).catch(() => '?');
        const dialogs = await desk().locator('.modal.show .modal-title, .msgprint').allInnerTexts().catch(() => []);
        throw new Error(`${title}: stuck at step ${i + 1}: ${tipText} | ${nextState} | route ${route} | dialogs ${JSON.stringify(dialogs).slice(0, 300)}`);
      }
      console.log(`[tour] ${title} step ${i + 1}: ${(await desk().locator('.ec-tip').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)}`);
      if (await failed.isVisible()) {
        throw new Error(`${title}: ${await desk().locator('.ec-tip').innerText()}`);
      }
      if (await doneCard.isVisible()) break;
      await next.click();
    }
    await expect(desk().locator('.ec-done')).toContainText(`Done. ${title}.`);
    await desk().locator('[data-ec="end"]').click();
    await expect(desk().locator('.ec-overlay.is-on')).toHaveCount(0);
    await expect(desk().locator('.ec-guard.is-on')).toHaveCount(0);
  });
}

test('tour counts and feedback are kept', async () => {
  await page.locator('.ec-bar').getByRole('button', { name: 'Guided tours' }).click();
  await expect(page.locator('.ec-tab', { hasText: 'Accounting' })).toContainText('3/3');
  await page.keyboard.press('Escape');

  await page.locator('.ec-bar').getByRole('button', { name: 'Feedback' }).click();
  await page.getByRole('radio', { name: '5' }).click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByText('Thanks, that helps.')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_feedback') || '[]'));
  expect(saved.some(f => f.kind === 'general' && f.rating === 5)).toBe(true);
  expect(errors).toEqual([]);
});
