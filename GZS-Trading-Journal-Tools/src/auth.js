// ============================================================================
// Clerk authentication for the vanilla Trade Journal app.
//
// Fully-bundled setup: the Clerk JS SDK is an npm dependency (@clerk/clerk-js),
// so nothing is fetched from cdn.clerk.com at runtime (blocked on some
// networks). The publishable key is read from Vite env
// (GZS-Trading-Journal-Tools/.env):
//   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
//
// Per Clerk v6 docs, the npm ESM build does NOT ship the UI components —
// they are loaded as a separate bundle from the Frontend API domain
// (derived from the publishable key), then passed into clerk.load().
//
// Flow: gate the app shell behind Clerk's mounted <SignIn/> component; the
// journal only boots (app.js) once a user session exists.
// ============================================================================

import { Clerk } from '@clerk/clerk-js'

const CLERK_PK = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

// Derive the Frontend API domain from the publishable key (Clerk v6 pattern)
function fapiDomain(pk) {
  try {
    return atob(pk.split('_')[2]).replace(/\$$/, '')
  } catch {
    return ''
  }
}

/**
 * Loads the Clerk UI bundle (required for mountSignIn/mountUserButton in v6).
 * @returns {Promise<void>}
 */
function loadClerkUIBundle() {
  return new Promise((resolve, reject) => {
    if (window.__internal_ClerkUICtor) return resolve()
    const domain = fapiDomain(CLERK_PK)
    const script = document.createElement('script')
    script.src = `https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load the Clerk UI bundle. Check your network connection.'))
    document.head.appendChild(script)
  })
}

// Appearance matched to the LuxAlgo dark terminal theme used by the journal
const CLERK_APPEARANCE = {
  variables: {
    colorBackground: '#161c26',
    colorInputBackground: '#10151d',
    colorInputText: '#e8eef8',
    colorText: '#e8eef8',
    colorMuted: '#8b98ad',
    colorPrimary: '#37d6a0',
    colorDanger: '#f87171',
    colorSuccess: '#37d6a0',
    colorWarning: '#fbbf24',
    borderRadius: '0.55rem',
    fontFamily: "'Inter', 'IBM Plex Sans', sans-serif"
  },
  elements: {
    card: { border: '1px solid #2a3547', boxShadow: '0 18px 50px rgba(0,0,0,0.45)' },
    socialButtonsBlockButton: { border: '1px solid #2a3547', color: '#e8eef8' },
    footer: { background: 'transparent', border: '0' },
    footerAction: { background: 'transparent' },
    footerActionText: { color: '#8b98ad' },
    footerActionLink: { color: '#37d6a0' },
    developmentModeWarning: {
      background: '#10151d',
      border: '1px solid rgba(251,191,36,0.35)',
      color: '#fbbf24',
      boxShadow: 'none'
    },
    formFieldLabel: { color: '#8b98ad' },
    identityPreview: { background: '#10151d', border: '1px solid #2a3547' },
    identityPreviewText: { color: '#e8eef8' },
    formFieldInput: { background: '#10151d', color: '#e8eef8' },
    headerTitle: { color: '#e8eef8' },
    headerSubtitle: { color: '#8b98ad' }
  }
}

function showSetupScreen(authRoot) {
  authRoot.innerHTML = `
    <div class="clerk-setup-card">
      <div class="clerk-setup-brand"><b>Trade Journal</b><small>Setup required</small></div>
      <p>Clerk publishable key not found. Create a free app at
        <a href="https://dashboard.clerk.com" target="_blank" rel="noreferrer">dashboard.clerk.com</a>,
        copy the <code>pk_test_&hellip;</code> key, and put it in
        <code>GZS-Trading-Journal-Tools/.env</code>:</p>
      <pre>VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here</pre>
      <p class="clerk-setup-muted">Then restart the dev server.</p>
    </div>`
  authRoot.hidden = false
}

function mountUserChip(clerk) {
  const chip = document.getElementById('clerk-user')
  if (!chip || chip.dataset.mounted === 'true') return
  chip.hidden = false
  chip.dataset.mounted = 'true'
  chip.innerHTML = ''
  clerk.mountUserButton(chip, { appearance: CLERK_APPEARANCE })
}

function unmountUserChip() {
  const chip = document.getElementById('clerk-user')
  if (!chip) return
  chip.hidden = true
  delete chip.dataset.mounted
  chip.innerHTML = ''
}

/**
 * Boots Clerk and gates the app shell.
 * @param {() => void} onReady called once a signed-in session exists
 * @returns {Promise<void>}
 */
export async function initAuth(onReady) {
  const authRoot = document.getElementById('clerk-auth')
  const shell = document.querySelector('.app-shell')

  if (!CLERK_PK || !/^pk_(test|live)_/.test(CLERK_PK)) {
    shell.hidden = true
    showSetupScreen(authRoot)
    return
  }

  let clerk
  try {
    await loadClerkUIBundle()
    clerk = new Clerk(CLERK_PK)
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor }
    })
  } catch (err) {
    authRoot.innerHTML = `
      <div class="clerk-setup-card">
        <div class="clerk-setup-brand"><b>Trade Journal</b><small>Authentication unavailable</small></div>
        <p>${err.message || 'Could not start authentication.'}</p>
      </div>`
    authRoot.hidden = false
    shell.hidden = true
    return
  }

  let appStarted = false
  let signInMounted = false

  const signInHost = document.createElement('div')
  authRoot.appendChild(signInHost)

  function sync() {
    if (clerk.user) {
      authRoot.hidden = true
      if (signInMounted) {
        signInMounted = false
        signInHost.innerHTML = ''
      }
      shell.hidden = false
      mountUserChip(clerk)
      if (!appStarted) {
        appStarted = true
        onReady()
      }
    } else {
      shell.hidden = true
      unmountUserChip()
      authRoot.hidden = false
      // Mount the sign-in component exactly ONCE. Clerk emits many events
      // (errors, session updates, ...); tearing down and re-mounting the
      // component on each one crashes its renderer ("removeChild" DOM error)
      // and leaves the card blank mid-flow (e.g. after a failed attempt).
      if (!signInMounted) {
        signInMounted = true
        clerk.mountSignIn(signInHost, {
          appearance: CLERK_APPEARANCE,
          forceRedirectUrl: '/',
          signInForceRedirectUrl: '/',
          signUpForceRedirectUrl: '/'
        })
      }
    }
  }

  clerk.addListener(sync)
  sync()
}
