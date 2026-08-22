export const SELECTED_SYMBOL_SCALE = 1.06
export const SELECTED_SYMBOL_ROTATION_DEGREES = 6

/** Returns a stable clockwise or counter-clockwise selection tilt. */
export function getSelectedSymbolRotationOffset(
  cardId: string,
  symbolId: string,
): number {
  const direction =
    hashText(`${cardId}:${symbolId}:selection-rotation`) % 2 === 0 ? -1 : 1

  return direction * SELECTED_SYMBOL_ROTATION_DEGREES
}

function hashText(value: string): number {
  let hash = 2_166_136_261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}
