import { describe, expect, it } from 'vitest'

import {
  SELECTED_SYMBOL_ROTATION_DEGREES,
  SELECTED_SYMBOL_SCALE,
  UNSELECTED_SYMBOL_FILTER,
  getSelectedSymbolRotationOffset,
} from './card-selection'

describe('card selection presentation', () => {
  it('keeps the emphasis within the restrained tuning ranges', () => {
    expect(SELECTED_SYMBOL_SCALE).toBeGreaterThanOrEqual(1.04)
    expect(SELECTED_SYMBOL_SCALE).toBeLessThanOrEqual(1.08)
    expect(SELECTED_SYMBOL_ROTATION_DEGREES).toBeGreaterThanOrEqual(4)
    expect(SELECTED_SYMBOL_ROTATION_DEGREES).toBeLessThanOrEqual(8)
    expect(UNSELECTED_SYMBOL_FILTER).toBe('saturate(0.42)')
  })

  it('derives a stable signed rotation from card and symbol data', () => {
    const inputs = [
      ['card-13', 'sun'],
      ['card-13', 'moon'],
      ['card-52', 'sun'],
      ['card-52', 'cat'],
    ] as const
    const firstPass = inputs.map(([cardId, symbolId]) =>
      getSelectedSymbolRotationOffset(cardId, symbolId),
    )

    expect(
      inputs.map(([cardId, symbolId]) =>
        getSelectedSymbolRotationOffset(cardId, symbolId),
      ),
    ).toEqual(firstPass)
    expect(new Set(firstPass)).toEqual(
      new Set([
        -SELECTED_SYMBOL_ROTATION_DEGREES,
        SELECTED_SYMBOL_ROTATION_DEGREES,
      ]),
    )
  })
})
