export const CARD_LAYOUT_EDGE_PADDING = 0.055
export const CARD_LAYOUT_SLOT_GAP = 0.04
export const MIN_CARD_DIAMETER_PX = 288
export const MIN_SYMBOL_TARGET_PX = 48
export const MIN_SYMBOL_SIZE = 0.076
export const MAX_SYMBOL_SIZE = 0.2

export type CardLayoutSlot = Readonly<{
  x: number
  y: number
  size: number
  rotation: number
  collisionRadius: number
}>

export type CardLayoutTemplate = Readonly<{
  id: string
  slots: readonly CardLayoutSlot[]
}>

export type CardLayoutCard = Readonly<{
  id: string
  symbolIds: readonly string[]
}>

export type SymbolLayout = Readonly<{
  symbolId: string
  slotIndex: number
  x: number
  y: number
  size: number
  rotation: number
  collisionRadius: number
}>

export type CardLayoutPlan = Readonly<{
  templateId: string
  templateRotation: number
  symbols: readonly SymbolLayout[]
}>

/**
 * Fixed output from scripts/generate-card-layout-templates.mjs. Coordinates and
 * collision radii use a unit circle centered at (0, 0).
 */
export const CARD_LAYOUT_TEMPLATES: readonly CardLayoutTemplate[] = [
  template('aurora', [
    [0.357, 0.461, 0.2, -163, 0.302],
    [-0.627, 0.008, 0.175, -69, 0.265],
    [-0.319, 0.618, 0.155, 147, 0.234],
    [-0.121, 0.166, 0.135, 134, 0.204],
    [0.477, -0.392, 0.118, -86, 0.178],
    [-0.063, -0.259, 0.102, 33, 0.17],
    [-0.253, -0.667, 0.088, 67, 0.17],
    [0.664, 0.033, 0.076, -82, 0.17],
  ]),
  template('borealis', [
    [-0.269, 0.277, 0.2, -56, 0.302],
    [0.028, -0.285, 0.175, -28, 0.265],
    [0.193, 0.668, 0.155, -112, 0.234],
    [0.282, 0.173, 0.135, -5, 0.204],
    [-0.729, 0.001, 0.118, -22, 0.178],
    [-0.166, -0.736, 0.11, 26, 0.17],
    [0.697, -0.258, 0.105, 136, 0.17],
    [-0.461, -0.301, 0.095, -15, 0.17],
  ]),
  template('cascade', [
    [-0.153, 0.075, 0.2, 52, 0.302],
    [0.629, 0.218, 0.175, 13, 0.265],
    [0.19, 0.558, 0.155, -12, 0.234],
    [-0.708, 0.162, 0.135, -144, 0.204],
    [-0.263, 0.687, 0.118, 42, 0.178],
    [0.303, -0.697, 0.11, 19, 0.17],
    [-0.27, -0.69, 0.105, -155, 0.17],
    [0.202, -0.315, 0.095, 52, 0.17],
  ]),
  template('delta', [
    [0.293, -0.029, 0.2, 159, 0.302],
    [0.264, 0.611, 0.175, 54, 0.265],
    [-0.284, 0.532, 0.155, 89, 0.234],
    [-0.225, -0.248, 0.135, 77, 0.204],
    [-0.589, -0.005, 0.118, 106, 0.178],
    [0.691, 0.316, 0.102, 12, 0.17],
    [-0.448, -0.614, 0.088, -86, 0.17],
    [0.227, -0.553, 0.076, 119, 0.17],
  ]),
  template('ember', [
    [0.097, -0.028, 0.2, -92, 0.302],
    [0.319, 0.553, 0.175, 95, 0.265],
    [-0.458, 0.18, 0.155, -170, 0.234],
    [0.647, -0.139, 0.135, -62, 0.204],
    [0.233, -0.546, 0.118, 170, 0.178],
    [-0.222, -0.47, 0.102, 5, 0.17],
    [-0.564, -0.271, 0.088, -17, 0.17],
    [-0.222, 0.652, 0.076, -173, 0.17],
  ]),
  template('fjord', [
    [0.628, 0.002, 0.2, 15, 0.302],
    [-0.161, -0.646, 0.175, 136, 0.265],
    [0.052, -0.134, 0.155, -70, 0.234],
    [-0.699, -0.016, 0.135, 158, 0.204],
    [-0.303, 0.171, 0.118, -125, 0.178],
    [0.409, -0.505, 0.102, -2, 0.17],
    [-0.062, 0.615, 0.088, 52, 0.17],
    [0.234, 0.353, 0.076, -106, 0.17],
  ]),
  template('glimmer', [
    [-0.234, -0.005, 0.2, 123, 0.302],
    [0.352, 0.215, 0.175, 177, 0.265],
    [-0.035, -0.695, 0.155, 31, 0.234],
    [0.263, -0.301, 0.135, 20, 0.204],
    [-0.42, 0.62, 0.118, -61, 0.178],
    [-0.756, -0.073, 0.11, -9, 0.17],
    [0.294, 0.701, 0.105, 121, 0.17],
    [0.709, -0.12, 0.095, -39, 0.17],
  ]),
  template('harbor', [
    [-0.216, -0.026, 0.2, -128, 0.302],
    [0.649, -0.145, 0.175, -141, 0.265],
    [-0.352, 0.55, 0.155, 131, 0.234],
    [0.278, 0.599, 0.135, -119, 0.204],
    [-0.108, -0.551, 0.118, 3, 0.178],
    [0.274, 0.17, 0.102, -16, 0.17],
    [0.263, -0.71, 0.088, -170, 0.17],
    [-0.738, 0.05, 0.076, 27, 0.17],
  ]),
  template('isotope', [
    [0.17, 0.123, 0.2, -21, 0.302],
    [-0.172, 0.643, 0.175, -100, 0.265],
    [-0.38, -0.59, 0.155, -127, 0.234],
    [0.569, -0.272, 0.135, 101, 0.204],
    [0.38, 0.616, 0.118, 67, 0.178],
    [-0.749, 0.127, 0.11, -23, 0.17],
    [0.381, -0.658, 0.105, -101, 0.17],
    [-0.356, 0.164, 0.095, 94, 0.17],
  ]),
  template('juno', [
    [-0.615, 0.027, 0.2, 87, 0.302],
    [0.145, -0.518, 0.175, -59, 0.265],
    [0.633, -0.216, 0.155, -27, 0.234],
    [-0.056, -0.025, 0.135, -38, 0.204],
    [0.177, 0.73, 0.118, 131, 0.178],
    [-0.348, -0.523, 0.102, -30, 0.17],
    [-0.093, 0.431, 0.088, -32, 0.17],
    [0.272, 0.252, 0.076, 161, 0.17],
  ]),
  template('kestrel', [
    [0.064, 0.235, 0.2, -165, 0.302],
    [-0.538, 0.392, 0.175, -18, 0.265],
    [-0.426, -0.55, 0.155, 73, 0.234],
    [0.418, -0.202, 0.135, -176, 0.204],
    [0.174, -0.565, 0.118, -163, 0.178],
    [-0.498, -0.096, 0.102, -37, 0.17],
    [0.727, 0.198, 0.088, 37, 0.17],
    [-0.086, 0.755, 0.076, -131, 0.17],
  ]),
  template('lagoon', [
    [0.379, 0.049, 0.2, -57, 0.302],
    [0.164, -0.645, 0.175, 23, 0.265],
    [-0.368, 0.027, 0.155, 174, 0.234],
    [-0.195, 0.49, 0.135, 44, 0.204],
    [0.615, -0.433, 0.118, -99, 0.178],
    [0.288, 0.568, 0.102, -44, 0.17],
    [-0.629, 0.427, 0.088, 106, 0.17],
    [-0.272, -0.422, 0.076, -64, 0.17],
  ]),
]

/** Builds stable, distinct template plans for the two currently displayed cards. */
export function getPairLayoutPlans(
  cards: readonly CardLayoutCard[],
  pairRevision: number,
): readonly [CardLayoutPlan, CardLayoutPlan] {
  if (cards.length !== 2) {
    throw new Error('Exactly two cards are required to plan a card pair.')
  }

  const [firstCard, secondCard] = cards

  if (!firstCard || !secondCard) {
    throw new Error('Unable to resolve both cards for layout planning.')
  }

  const pairSeed = `${pairRevision}:${firstCard.id}:${secondCard.id}`
  const templateCount = CARD_LAYOUT_TEMPLATES.length
  const firstTemplateIndex =
    hashText(`${pairSeed}:template:first`) % templateCount
  const secondTemplateCandidate =
    hashText(`${pairSeed}:template:second`) % (templateCount - 1)
  const secondTemplateIndex =
    secondTemplateCandidate >= firstTemplateIndex
      ? secondTemplateCandidate + 1
      : secondTemplateCandidate

  return [
    buildCardLayoutPlan(firstCard, pairSeed, firstTemplateIndex),
    buildCardLayoutPlan(secondCard, pairSeed, secondTemplateIndex),
  ]
}

/** Builds one deterministic plan for reviewing a specific fixed template. */
export function getCardLayoutPreviewPlan(
  card: CardLayoutCard,
  templateIndex: number,
): CardLayoutPlan {
  if (!Number.isInteger(templateIndex)) {
    throw new Error('A whole-number template index is required.')
  }

  return buildCardLayoutPlan(card, `preview:${templateIndex}`, templateIndex)
}

/** Returns every geometry problem found in a normalized template. */
export function validateCardLayoutTemplate(
  layoutTemplate: CardLayoutTemplate,
): string[] {
  const errors: string[] = []

  if (layoutTemplate.slots.length !== 8) {
    errors.push(`${layoutTemplate.id} must contain exactly eight slots.`)
  }

  layoutTemplate.slots.forEach((slot, index) => {
    if (
      ![slot.x, slot.y, slot.size, slot.rotation, slot.collisionRadius].every(
        Number.isFinite,
      )
    ) {
      errors.push(
        `${layoutTemplate.id} slot ${index} contains non-finite data.`,
      )
    }

    if (
      slot.size < MIN_SYMBOL_SIZE ||
      slot.size > MAX_SYMBOL_SIZE ||
      slot.collisionRadius < slot.size * 1.5
    ) {
      errors.push(`${layoutTemplate.id} slot ${index} has invalid sizing.`)
    }

    const edgeExtent =
      Math.hypot(slot.x, slot.y) +
      slot.collisionRadius +
      CARD_LAYOUT_EDGE_PADDING

    if (edgeExtent > 1) {
      errors.push(`${layoutTemplate.id} slot ${index} crosses the card edge.`)
    }

    const targetDiameter = slot.collisionRadius * MIN_CARD_DIAMETER_PX

    if (targetDiameter < MIN_SYMBOL_TARGET_PX) {
      errors.push(`${layoutTemplate.id} slot ${index} is too small to tap.`)
    }

    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const otherSlot = layoutTemplate.slots[otherIndex]

      if (!otherSlot) {
        continue
      }

      const distance = Math.hypot(slot.x - otherSlot.x, slot.y - otherSlot.y)
      const requiredDistance =
        slot.collisionRadius + otherSlot.collisionRadius + CARD_LAYOUT_SLOT_GAP

      if (distance < requiredDistance) {
        errors.push(
          `${layoutTemplate.id} slots ${otherIndex} and ${index} collide.`,
        )
      }
    }
  })

  return errors
}

/** Rotates a normalized slot without changing its collision geometry. */
export function rotateCardLayoutSlot(
  slot: CardLayoutSlot,
  rotation: number,
): CardLayoutSlot {
  const radians = (rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)

  return {
    ...slot,
    x: slot.x * cosine - slot.y * sine,
    y: slot.x * sine + slot.y * cosine,
    rotation: normalizeRotation(slot.rotation + rotation),
  }
}

function buildCardLayoutPlan(
  card: CardLayoutCard,
  pairSeed: string,
  templateIndex: number,
): CardLayoutPlan {
  if (card.symbolIds.length !== 8) {
    throw new Error('Exactly eight symbols are required to plan a card.')
  }

  const selectedTemplate = CARD_LAYOUT_TEMPLATES[templateIndex]

  if (!selectedTemplate) {
    throw new Error('Unable to resolve the selected card layout template.')
  }

  const templateRotation = hashText(`${pairSeed}:${card.id}:rotation`) % 360
  const slotIndexes = shuffleIndexes(
    selectedTemplate.slots.length,
    `${pairSeed}:${card.id}:symbols`,
  )

  return {
    templateId: selectedTemplate.id,
    templateRotation,
    symbols: card.symbolIds.map((symbolId, symbolIndex) => {
      const slotIndex = slotIndexes[symbolIndex]
      const slot =
        slotIndex === undefined ? undefined : selectedTemplate.slots[slotIndex]

      if (slotIndex === undefined || !slot) {
        throw new Error('Unable to assign a symbol to a layout slot.')
      }

      return {
        symbolId,
        slotIndex,
        ...rotateCardLayoutSlot(slot, templateRotation),
      }
    }),
  }
}

function shuffleIndexes(length: number, seed: string): number[] {
  const indexes = Array.from({ length }, (_, index) => index)
  let state = hashText(seed)

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    state = nextRandomState(state)
    const swapIndex = Math.floor((state * (index + 1)) / 0x1_0000_0000)
    const currentValue = indexes[index]
    const swapValue = indexes[swapIndex]

    if (currentValue === undefined || swapValue === undefined) {
      throw new Error('Unable to shuffle card layout slots.')
    }

    indexes[index] = swapValue
    indexes[swapIndex] = currentValue
  }

  return indexes
}

function nextRandomState(state: number): number {
  return (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
}

function normalizeRotation(rotation: number): number {
  return (((rotation % 360) + 540) % 360) - 180
}

function hashText(value: string): number {
  let hash = 2_166_136_261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

function template(
  id: string,
  slots: ReadonlyArray<
    readonly [
      x: number,
      y: number,
      size: number,
      rotation: number,
      collisionRadius: number,
    ]
  >,
): CardLayoutTemplate {
  return {
    id,
    slots: slots.map(([x, y, size, rotation, collisionRadius]) => ({
      x,
      y,
      size,
      rotation,
      collisionRadius,
    })),
  }
}
