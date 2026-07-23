const HEX_CHARACTERS = '0123456789abcdef'

export const PRIVATE_PLAYER_KEY_LENGTH = 32
export const MAX_PRIVATE_KEY_ATTEMPTS = 10

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
