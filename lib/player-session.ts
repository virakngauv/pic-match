const CLIENT_TOKEN_KEY = 'pic-match:client-token'
const CLIENT_TOKEN_PATTERN = /^[0-9a-f]{32}$/
const CLIENT_TOKEN_CHANGED_EVENT = 'pic-match:client-token-changed'

// Browsers can throw when storage persistence is blocked; the session then
// falls back to this module copy so the token still works for the page load.
let blockedStorageToken: string | null = null

export function generateClientToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

export function saveClientToken(clientToken: string) {
  if (!CLIENT_TOKEN_PATTERN.test(clientToken)) {
    throw new Error('Invalid client token.')
  }

  try {
    window.localStorage.setItem(CLIENT_TOKEN_KEY, clientToken)
  } catch {
    // Persistence is optional; the memory copy keeps the session alive.
    blockedStorageToken = clientToken
  }
  window.dispatchEvent(new Event(CLIENT_TOKEN_CHANGED_EVENT))
}

export function getClientToken() {
  let storedToken: string | null = null
  try {
    storedToken = window.localStorage.getItem(CLIENT_TOKEN_KEY)
  } catch {
    // Reading can also throw when storage is blocked.
  }

  if (storedToken && CLIENT_TOKEN_PATTERN.test(storedToken)) {
    return storedToken
  }

  // A readable-but-unwritable storage (for example zero-quota behavior)
  // holds no token, so the memory copy from the failed write keeps the
  // session stable.
  return blockedStorageToken && CLIENT_TOKEN_PATTERN.test(blockedStorageToken)
    ? blockedStorageToken
    : null
}

export function getOrCreateClientToken() {
  const existingToken = getClientToken()

  if (existingToken) {
    return existingToken
  }

  const clientToken = generateClientToken()
  saveClientToken(clientToken)
  return clientToken
}

export function subscribeToClientToken(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (
      event.storageArea === window.localStorage &&
      event.key === CLIENT_TOKEN_KEY
    ) {
      onStoreChange()
    }
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(CLIENT_TOKEN_CHANGED_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(CLIENT_TOKEN_CHANGED_EVENT, onStoreChange)
  }
}
