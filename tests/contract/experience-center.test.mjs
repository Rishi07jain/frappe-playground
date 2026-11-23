// Contract tests for the ERPNext Experience Center layer. They run without a browser:
// the desk scripts are evaluated in a small fake window.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { TOUR_MODULES, TOURS } from '../../packages/client/src/experience/catalog.js'
import { indianFiscalYear, setupArgs } from '../../packages/client/src/experience/boot.js'

const DESK = new URL('../../packages/client/src/experience/desk/', import.meta.url)

async function loadDesk() {
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    parent: null,
    location: { origin: 'http://localhost' },
  }
  window.window = window
  const context = vm.createContext({
    window,
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    setTimeout, clearTimeout, Promise, console,
    getComputedStyle: () => ({}), CSS: { escape: s => s },
  })
  for (const file of ['core.js', 'tours.js', 'driver.js']) {
    vm.runInContext(await readFile(new URL(file, DESK), 'utf8'), context, { filename: file })
  }
  return window.ECDesk
}

test('every tour in the menu has steps in the desk', async () => {
  const desk = await loadDesk()
  for (const tour of TOURS) {
    assert.equal(typeof desk.tours[tour.id]?.build, 'function', `missing steps for ${tour.id}`)
    assert.ok(TOUR_MODULES.some(m => m.key === tour.module), `unknown module ${tour.module}`)
  }
  assert.equal(TOURS.length, 17)
})

test('the guard treats saves and deletes as writes, and reads as reads', async () => {
  const desk = await loadDesk()
  for (const cmd of [
    'frappe.desk.form.save.savedocs',
    'frappe.desk.form.save.cancel',
    'frappe.client.set_value',
    'frappe.client.delete',
    'frappe.desk.reportview.delete_items',
    'frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs',
    'frappe.handler.upload_file',
  ]) assert.equal(desk.isWrite(cmd), true, cmd)
  for (const cmd of [
    'frappe.desk.form.load.getdoc',
    'frappe.desk.reportview.get',
    'frappe.client.get_value',
    'frappe.desk.search.search_link',
    'frappe.core.doctype.user.user.switch_theme',
    undefined,
  ]) assert.equal(desk.isWrite(cmd), false, String(cmd))
})

test('setup runs for an Indian fiscal year that contains today', () => {
  assert.deepEqual(indianFiscalYear(new Date('2026-11-23')), { start: '2026-04-01', end: '2027-03-31' })
  assert.deepEqual(indianFiscalYear(new Date('2027-02-10')), { start: '2026-04-01', end: '2027-03-31' })
  assert.deepEqual(indianFiscalYear(new Date('2027-04-01')), { start: '2027-04-01', end: '2028-03-31' })
  const args = setupArgs(new Date('2026-11-23'))
  assert.equal(args.company_name, 'Demo Industries Pvt Ltd')
  assert.equal(args.company_abbr, 'DI')
  assert.equal(args.country, 'India')
  assert.equal(args.currency, 'INR')
})

test('the seed module is exported for the worker', async () => {
  const generator = await readFile(new URL('../../scripts/generate-python-sources.mjs', import.meta.url), 'utf8')
  assert.match(generator, /EXPERIENCE_CENTER_SOURCE/)
  const seed = await readFile(new URL('../../runtime/python/experience_center.py', import.meta.url), 'utf8')
  for (const fn of ['def status', 'def seed']) assert.ok(seed.includes(fn), fn)
  assert.match(seed, /@frappe\.whitelist/)
})
