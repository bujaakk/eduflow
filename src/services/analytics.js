import * as amplitude from '@amplitude/unified'

let initialized = false
let enabled = false

const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY
const sessionReplaySampleRate = Number(import.meta.env.VITE_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE || 0)
const AMPLITUDE_INIT_FLAG = '__EDUFLOW_AMPLITUDE_INITIALIZED__'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function initAnalytics() {
  if (!isBrowser()) return false
  if (initialized) return enabled

  if (window[AMPLITUDE_INIT_FLAG]) {
    initialized = true
    enabled = true
    return enabled
  }

  initialized = true

  if (!apiKey) {
    enabled = false
    return enabled
  }

  try {
    amplitude.initAll(apiKey, {
      logLevel: 0,
      enableDiagnostics: false,
      analytics: {
        autocapture: true,
      },
      sessionReplay: {
        sampleRate: sessionReplaySampleRate,
      },
    })
  } catch {
    enabled = false
    return enabled
  }

  window[AMPLITUDE_INIT_FLAG] = true
  enabled = true
  return enabled
}

export function identifyUser(user, role = '', profile = null) {
  if (!enabled || !user?.uid) return

  amplitude.setUserId(user.uid)

  const identifyPayload = new amplitude.Identify()
  if (user.email) identifyPayload.set('email', user.email)
  if (role) identifyPayload.set('role', role)
  if (profile?.environmentId) identifyPayload.set('environmentId', profile.environmentId)
  amplitude.identify(identifyPayload)
}

export function clearAnalyticsUser() {
  if (!enabled) return
  amplitude.reset()
}

export function trackPageView(pathname, search = '') {
  if (!enabled) return
  amplitude.track('page_view', {
    path: pathname,
    search,
  })
}

export function trackEvent(eventName, eventProperties = {}) {
  if (!enabled) return
  amplitude.track(eventName, eventProperties)
}
