const HEX_CHARACTERS = '0123456789abcdef'

export const PRIVATE_PLAYER_KEY_LENGTH = 32
export const MAX_PRIVATE_KEY_ATTEMPTS = 10
export const CLIENT_TOKEN_PATTERN = /^[0-9a-f]{32}$/

export function validateClientToken(clientToken: string) {
  if (!CLIENT_TOKEN_PATTERN.test(clientToken)) {
    throw new Error('Invalid client token.')
  }

  return clientToken
}

export function parseClientToken(clientToken: string | null) {
  return clientToken && CLIENT_TOKEN_PATTERN.test(clientToken)
    ? clientToken
    : null
}

export function validateClientInstanceId(clientInstanceId: string) {
  if (!CLIENT_TOKEN_PATTERN.test(clientInstanceId)) {
    throw new Error('Invalid client instance ID.')
  }

  return clientInstanceId
}

function pickCharacter(characters: string, random: () => number) {
  return characters.charAt(Math.floor(random() * characters.length))
}

export function generatePrivatePlayerKey(random: () => number = Math.random) {
  return Array.from({ length: PRIVATE_PLAYER_KEY_LENGTH }, () =>
    pickCharacter(HEX_CHARACTERS, random),
  ).join('')
}

export async function findAvailablePrivatePlayerKey(
  isTaken: (key: string) => Promise<boolean>,
  generate: () => string = generatePrivatePlayerKey,
) {
  for (let attempt = 0; attempt < MAX_PRIVATE_KEY_ATTEMPTS; attempt += 1) {
    const key = generate()

    if (!(await isTaken(key))) {
      return key
    }
  }

  throw new Error('Unable to create a player identity. Please try again.')
}
