const SESSION_KEY = 'bookportfolio_session'
const PREFS_KEY   = 'bookportfolio_prefs'

interface Prefs {
  page?: number
  sound?: boolean
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    if (patch.page !== undefined) {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}') as Prefs
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, page: patch.page }))
    }
    if (patch.sound !== undefined) {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...p, sound: patch.sound }))
    }
  } catch (_) {}
}

export function loadPrefs(): Prefs {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}') as Prefs
    const prefs   = JSON.parse(localStorage.getItem(PREFS_KEY)   ?? '{}') as Prefs
    return { ...prefs, ...session }
  } catch (_) { return {} }
}
