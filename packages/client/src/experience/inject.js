// Puts the Experience Center code into the Frappe desk inside the playground iframe.
// The desk is same-origin, so the shell can add a <style> and a <script> to it. The
// sources are bundled as strings (Vite ?raw) and run in the desk's own window, where
// they can use frappe.* directly. Called on every address sync; it is a no-op once a
// page has been injected, and a full reload of the desk gets a fresh copy.
import coreSource from './desk/core.js?raw'
import toursSource from './desk/tours.js?raw'
import driverSource from './desk/driver.js?raw'
import deskCss from './desk/desk.css?raw'

export const DESK_SOURCE = [coreSource, toursSource, driverSource].join('\n;\n')

export function injectExperience(win, config) {
  let doc
  try {
    doc = win?.document
    if (!doc || !doc.head || !doc.body || win.__ecInjected) return false
    if (doc.readyState === 'loading' || !win.frappe) return false
  } catch (_) {
    return false
  }
  win.__ecInjected = true

  const style = doc.createElement('style')
  style.id = 'ec-desk-css'
  style.textContent = deskCss
  doc.head.appendChild(style)

  const script = doc.createElement('script')
  script.id = 'ec-desk-js'
  script.textContent = `${DESK_SOURCE}\n;window.ECDesk && window.ECDesk.init(${JSON.stringify(config)});`
  doc.body.appendChild(script)
  return true
}
