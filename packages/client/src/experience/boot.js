import { EXPERIENCE_CENTER, LOGIN_DEMO } from '../playground/config.js'
import { createSiteApi } from '../playground/site-api.js'

const LOG = '[Experience]'
const API = '/api/method/frappe.experience_center'

export const COMPANY = Object.freeze({
  name: 'Demo Industries Pvt Ltd',
  abbr: 'DI',
  state: 'Maharashtra',
})

/** The Indian fiscal year (1 April to 31 March) that contains `date`. */
export function indianFiscalYear(date = new Date()) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return { start: `${year}-04-01`, end: `${year + 1}-03-31` }
}

/** Arguments for Frappe's setup_complete, including the ERPNext company slide. */
export function setupArgs(date = new Date()) {
  const fy = indianFiscalYear(date)
  return {
    language: 'en',
    country: 'India',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    full_name: 'Administrator',
    email: 'admin@example.com',
    password: LOGIN_DEMO.password,
    first_name: 'Admin',
    last_name: 'User',
    company_name: COMPANY.name,
    company_abbr: COMPANY.abbr,
    chart_of_accounts: 'Standard',
    fy_start_date: fy.start,
    fy_end_date: fy.end,
    bank_account: 'HDFC Bank',
    setup_demo: 0,
  }
}

async function json(response) {
  try {
    return (await response.json())?.message
  } catch (_) {
    return undefined
  }
}

/**
 * Bring the active instance to a ready Experience Center: ERPNext installed, signed in,
 * set up as Demo Industries, and seeded with the tours' sample data. Every step checks
 * what is already done, so a returning visitor only pays for the sign-in.
 *
 * `onStep(index, status)` reports progress for the two extra loading-screen steps:
 * 0 = Setting up ERPNext, 1 = Loading sample data.
 */
export async function runExperienceBoot({
  playground,
  instanceId,
  installApp,
  signal,
  onStep = () => {},
  logger = console,
  createSiteApiFn = createSiteApi,
  document = globalThis.document,
  now = () => new Date(),
}) {
  const request = createSiteApiFn({ instanceId, signal })
  onStep(0, 'active')

  if (!playground.listInstalledApps().includes('erpnext')) {
    logger.log(`${LOG} Installing ERPNext`)
    await installApp('erpnext')
  }
  signal?.throwIfAborted()

  const login = new FormData()
  login.append('usr', LOGIN_DEMO.username)
  login.append('pwd', LOGIN_DEMO.password)
  await request('/api/method/login', { method: 'POST', body: login }, 'Sign in')

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const csrf = document?.cookie?.match(/csrf_token=([^;]+)/)?.[1]
  if (csrf) headers['X-Frappe-CSRF-Token'] = csrf

  let status = await json(await request(`${API}.status`, { headers }, 'Read setup status'))
  if (!status?.setup_complete || !status?.company) {
    logger.log(`${LOG} Running setup for ${COMPANY.name}`)
    await request(
      '/api/method/frappe.desk.page.setup_wizard.setup_wizard.setup_complete',
      { method: 'POST', headers, body: JSON.stringify({ args: setupArgs(now()) }) },
      'Set up ERPNext',
    )
    status = await json(await request(`${API}.status`, { headers }, 'Read setup status'))
  }
  onStep(0, 'done')
  signal?.throwIfAborted()

  onStep(1, 'active')
  const done = new Set(status?.done || [])
  for (const stage of status?.stages || []) {
    if (done.has(stage)) continue
    signal?.throwIfAborted()
    logger.log(`${LOG} Seeding ${stage}`)
    await request(
      `${API}.seed`,
      { method: 'POST', headers, body: JSON.stringify({ stage }) },
      `Load sample data (${stage})`,
    )
  }
  onStep(1, 'done')

  return { initialPath: EXPERIENCE_CENTER.landingPath }
}
