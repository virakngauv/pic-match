const CLIENT_TOKEN_KEY = 'spot-it:client-token'
const LEGACY_PLAYER_KEY_PREFIX = 'spot-it:player-key'
const CLIENT_TOKEN_PATTERN = /^[0-9a-f]{32}$/
const CLIENT_TOKEN_CHANGED_EVENT = 'spot-it:client-token-changed'

function legacyStorageKey(roomCode: string) {
  return `${LEGACY_PLAYER_KEY_PREFIX}:${normalizeRoomCode(roomCode)}`
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toLowerCase()
}

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

  window.localStorage.setItem(CLIENT_TOKEN_KEY, clientToken)
  window.dispatchEvent(new Event(CLIENT_TOKEN_CHANGED_EVENT))
}

export function getClientToken(legacyRoomCode?: string) {
  const storedToken = window.localStorage.getItem(CLIENT_TOKEN_KEY)

  if (storedToken && CLIENT_TOKEN_PATTERN.test(storedToken)) {
    return storedToken
  }

  if (!legacyRoomCode) {
    return null
  }

  const legacyToken = window.sessionStorage.getItem(
    legacyStorageKey(legacyRoomCode),
  )
  return legacyToken && CLIENT_TOKEN_PATTERN.test(legacyToken)
    ? legacyToken
    : null
}

export function migrateLegacyClientToken(roomCode: string) {
  const storedToken = window.localStorage.getItem(CLIENT_TOKEN_KEY)

  if (storedToken && CLIENT_TOKEN_PATTERN.test(storedToken)) {
    return storedToken
  }

  if (storedToken) {
    window.localStorage.removeItem(CLIENT_TOKEN_KEY)
  }

  const legacyKey = legacyStorageKey(roomCode)
  const legacyToken = window.sessionStorage.getItem(legacyKey)

  if (!legacyToken || !CLIENT_TOKEN_PATTERN.test(legacyToken)) {
    if (legacyToken) {
      window.sessionStorage.removeItem(legacyKey)
    }
    return null
  }

  saveClientToken(legacyToken)
  window.sessionStorage.removeItem(legacyKey)
  return legacyToken
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
