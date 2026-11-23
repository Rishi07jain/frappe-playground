// Client-only presentation defaults. Server runtime configuration belongs in
// packages/server/src/config.js and must not be imported by the Vue shell.
export const LOGIN_DEMO = Object.freeze({
  prefill: true,
  username: 'Administrator',
  password: 'admin',
})

// ERPNext Experience Center. When enabled, the shell boots straight into a seeded
// ERPNext desk, hides the playground's own chrome (dock, instance and app managers),
// and adds the Experience Center top bar, edit guard and guided tours.
// Build with VITE_EXPERIENCE_CENTER=false to get the plain playground back (for example
// to run the upstream end-to-end suite).
export const EXPERIENCE_CENTER = Object.freeze({
  enabled: import.meta.env?.VITE_EXPERIENCE_CENTER !== 'false',
  trialUrl: 'https://frappecloud.com/dashboard/signup?product=erpnext',
  landingPath: '/desk',
  // Modules whose tours show in the Guided tours menu.
  tourModules: ['accounting', 'buying', 'selling', 'stock', 'assets', 'manufacturing'],
  // Optional: POST feedback JSON here (for example a Frappe Web Form endpoint).
  // Left empty, feedback is kept in this browser's localStorage.
  feedbackUrl: '',
})
