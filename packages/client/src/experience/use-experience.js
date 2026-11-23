import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { EXPERIENCE_CENTER } from '../playground/config.js'
import { TOUR_MODULES, TOURS } from './catalog.js'
import { injectExperience } from './inject.js'

const THEME_KEY = 'ec_theme'
const DONE_KEY = 'ec_tours_done'
const FEEDBACK_KEY = 'ec_feedback'
const WELCOME_KEY = 'ec_welcome_seen'

function read(storage, key, fallback) {
  try {
    const v = storage?.getItem(key)
    return v == null ? fallback : JSON.parse(v)
  } catch (_) {
    return fallback
  }
}

function systemTheme(win) {
  return win?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Shell-side state for the Experience Center: the tours menu, theme, feedback and the
 * welcome note, plus the bridge to the desk code inside the iframe.
 */
export function useExperience({ iframeRef, window: win = globalThis.window } = {}) {
  const storage = win?.localStorage
  const deskReady = ref(false)
  const tourRunning = ref(false)
  const runningTourId = ref('')
  const doneTours = ref(read(storage, DONE_KEY, []))
  const savedTheme = read(storage, THEME_KEY, null)
  const theme = ref(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme(win))
  const showWelcome = ref(false)
  const shownModules = TOUR_MODULES.filter(m => EXPERIENCE_CENTER.tourModules.includes(m.key))
  const shownTours = TOURS.filter(t => shownModules.some(m => m.key === t.module))

  const counts = computed(() => Object.fromEntries(shownModules.map(m => {
    const list = shownTours.filter(t => t.module === m.key)
    return [m.key, { done: list.filter(t => doneTours.value.includes(t.id)).length, all: list.length }]
  })))

  function deskConfig() {
    return {
      trialUrl: EXPERIENCE_CENTER.trialUrl,
      theme: theme.value,
      catalog: shownTours,
      modules: shownModules,
    }
  }

  function deskWindow() {
    try {
      return iframeRef.value?.contentWindow || null
    } catch (_) {
      return null
    }
  }

  /** Called on every address sync: (re)injects into a freshly loaded desk page. */
  function tick() {
    const w = deskWindow()
    if (!w) return
    if (injectExperience(w, deskConfig())) {
      deskReady.value = false
    }
  }

  function startTour(id) {
    const desk = deskWindow()?.ECDesk
    if (!desk || tourRunning.value) return false
    return desk.startTour(id)
  }

  function applyTheme(mode) {
    const root = win?.document?.documentElement
    if (root) root.classList.toggle('dark', mode === 'dark')
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try { storage?.setItem(THEME_KEY, JSON.stringify(theme.value)) } catch (_) {}
    applyTheme(theme.value)
    try { deskWindow()?.ECDesk?.setTheme(theme.value) } catch (_) {}
  }

  /**
   * Keep a feedback response. Every response is stored in this browser; when
   * EXPERIENCE_CENTER.feedbackUrl is set it is also POSTed there as JSON.
   */
  async function sendFeedback(payload) {
    const entry = {
      ...payload,
      at: new Date().toISOString(),
      page: (() => { try { return deskWindow()?.location?.pathname || '' } catch (_) { return '' } })(),
    }
    const list = read(storage, FEEDBACK_KEY, [])
    list.push(entry)
    try { storage?.setItem(FEEDBACK_KEY, JSON.stringify(list)) } catch (_) {}
    if (EXPERIENCE_CENTER.feedbackUrl) {
      try {
        await fetch(EXPERIENCE_CENTER.feedbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
      } catch (error) {
        console.warn('[Experience] feedback could not be sent', error)
      }
    }
    return entry
  }

  function onMessage(event) {
    if (event.origin !== win?.location?.origin) return
    if (event.source !== deskWindow()) return
    const msg = event.data
    if (!msg || msg.source !== 'ec-desk') return
    if (msg.type === 'ready') deskReady.value = true
    else if (msg.type === 'tour') {
      tourRunning.value = !!msg.running
      runningTourId.value = msg.running ? msg.id : ''
    } else if (msg.type === 'tours-done') doneTours.value = Array.isArray(msg.done) ? msg.done : doneTours.value
    else if (msg.type === 'feedback') sendFeedback(msg.payload || {})
  }

  /** Shown once per browser session, the first time the desk is ready. */
  function maybeWelcome() {
    try {
      if (win?.sessionStorage?.getItem(WELCOME_KEY)) return
      win?.sessionStorage?.setItem(WELCOME_KEY, '1')
    } catch (_) {}
    showWelcome.value = true
  }

  function resetProgress() {
    doneTours.value = []
    try { storage?.removeItem(DONE_KEY) } catch (_) {}
    tourRunning.value = false
    runningTourId.value = ''
    deskReady.value = false
  }

  onMounted(() => {
    applyTheme(theme.value)
    win?.addEventListener?.('message', onMessage)
  })
  onBeforeUnmount(() => win?.removeEventListener?.('message', onMessage))

  return {
    deskReady, tourRunning, runningTourId, doneTours, theme, showWelcome,
    modules: shownModules, tours: shownTours, counts,
    tick, startTour, toggleTheme, sendFeedback, maybeWelcome, resetProgress,
  }
}
