const SESSION_KEY = 'bookportfolio_session'
const PREFS_KEY = 'bookportfolio_prefs'

interface Prefs {
  /** Id of the page the reader was on (per session). */
  page?: string
  sound?: boolean
  /** Whether the "how to turn" hint has been dismissed. */
  hinted?: boolean
}

function read(store: Storage, key: string): Prefs {
  try {
    return JSON.parse(store.getItem(key) ?? '{}') as Prefs
  } catch {
    return {}
  }
}

export function savePrefs(patch: Prefs): void {
  try {
    if (patch.page !== undefined) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...read(sessionStorage, SESSION_KEY), page: patch.page }))
    const rest = { ...patch }
    delete rest.page
    if (Object.keys(rest).length) localStorage.setItem(PREFS_KEY, JSON.stringify({ ...read(localStorage, PREFS_KEY), ...rest }))
  } catch {
    // Storage can be unavailable (private mode); preferences are a nicety.
  }
}

export function loadPrefs(): Prefs {
  try {
    return { ...read(localStorage, PREFS_KEY), ...read(sessionStorage, SESSION_KEY) }
  } catch {
    return {}
  }
}
