// ============================================================================
// Clerk session-token verification.
//
// The browser sends the token it already holds (`clerk.session.getToken()`)
// as `Authorization: Bearer <jwt>`. We verify the RS256 signature against the
// instance's published JWKS and read `sub`, the Clerk user id. No dependency:
// node:crypto can import a JWK directly.
//
// Nothing here trusts the client. An unverifiable token is treated as no token.
// ============================================================================

import { createPublicKey, createVerify } from 'node:crypto'
import { loadEnv } from './env.mjs'

const JWKS_TTL_MS = 60 * 60 * 1000
let cache = { domain: '', at: 0, keys: new Map() }

/** Frontend API domain, derived from the publishable key (pk_test_/pk_live_). */
export function clerkDomain() {
  const pk = loadEnv().VITE_CLERK_PUBLISHABLE_KEY || ''
  if (!/^pk_(test|live)_/.test(pk)) return ''
  try {
    return atob(pk.split('_')[2]).replace(/\$$/, '')
  } catch {
    return ''
  }
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

async function signingKeys(domain) {
  if (cache.domain === domain && Date.now() - cache.at < JWKS_TTL_MS) return cache.keys
  const response = await fetch(`https://${domain}/.well-known/jwks.json`)
  if (!response.ok) throw new Error(`Clerk JWKS unavailable (HTTP ${response.status})`)
  const body = await response.json()
  const keys = new Map((body.keys || []).map((key) => [key.kid, key]))
  cache = { domain, at: Date.now(), keys }
  return keys
}

/**
 * @param {string} token
 * @returns {Promise<{userId: string, sessionId: string} | null>}
 */
export async function verifySessionToken(token) {
  const domain = clerkDomain()
  if (!domain || !token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  let header
  let payload
  try {
    header = decodePart(parts[0])
    payload = decodePart(parts[1])
  } catch {
    return null
  }

  if (header.alg !== 'RS256') return null

  let jwk
  try {
    jwk = (await signingKeys(domain)).get(header.kid)
  } catch {
    return null
  }
  if (!jwk) return null

  let valid = false
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    valid = createVerify('RSA-SHA256')
      .update(`${parts[0]}.${parts[1]}`)
      .verify(key, Buffer.from(parts[2], 'base64url'))
  } catch {
    return null
  }
  if (!valid) return null

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp < now) return null
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null
  if (typeof payload.iss === 'string' && !payload.iss.includes(domain)) return null
  if (typeof payload.sub !== 'string' || !payload.sub) return null

  return { userId: payload.sub, sessionId: typeof payload.sid === 'string' ? payload.sid : '' }
}
