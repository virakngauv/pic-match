const CONSONANTS = 'bcdfghkpqrstvz'
const FINAL_CHARACTERS = '23456789y'

export const MAX_ROOM_CODE_ATTEMPTS = 25
export const ROOM_CODE_PATTERN = /^[bcdfghkpqrstvz]{4}[2-9y]$/

export function normalizeRoomCode(code: string) {
  return code.trim().toLowerCase()
}

function pickCharacter(characters: string, random: () => number) {
  return characters.charAt(Math.floor(random() * characters.length))
}

export function generateRoomCode(random: () => number = Math.random) {
  const consonants = Array.from({ length: 4 }, () =>
    pickCharacter(CONSONANTS, random),
  ).join('')

  return `${consonants}${pickCharacter(FINAL_CHARACTERS, random)}`
}

export async function findAvailableRoomCode(
  isTaken: (code: string) => Promise<boolean>,
  generate: () => string = generateRoomCode,
) {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const code = generate()

    if (!(await isTaken(code))) {
      return code
    }
  }

  throw new Error('Unable to create a unique room code. Please try again.')
}
