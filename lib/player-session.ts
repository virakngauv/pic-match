const PLAYER_KEY_PREFIX = 'spot-it:player-key'

function storageKey(roomCode: string) {
  return `${PLAYER_KEY_PREFIX}:${roomCode.trim().toLowerCase()}`
}

export function savePrivatePlayerKey(
  roomCode: string,
  privatePlayerKey: string,
) {
  window.sessionStorage.setItem(storageKey(roomCode), privatePlayerKey)
}

export function getPrivatePlayerKey(roomCode: string) {
  return window.sessionStorage.getItem(storageKey(roomCode))
}

export function removePrivatePlayerKey(roomCode: string) {
  window.sessionStorage.removeItem(storageKey(roomCode))
}
