export const CARD_LAYOUT_EDGE_PADDING = 0.055
export const CARD_LAYOUT_SLOT_GAP = 0.04
export const MIN_CARD_DIAMETER_PX = 288
export const MIN_SYMBOL_TARGET_PX = 48

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
    [0.027, -0.429, 0.15, -163, 0.227],
    [-0.444, 0.566, 0.14, -69, 0.211],
    [0.248, 0.362, 0.129, 147, 0.194],
    [-0.413, -0.277, 0.122, 134, 0.184],
    [-0.046, 0.059, 0.115, -86, 0.173],
    [0.601, 0.135, 0.113, 33, 0.17],
    [0.56, -0.49, 0.108, 67, 0.17],
    [-0.437, 0.131, 0.103, -82, 0.17],
  ]),
  template('borealis', [
    [-0.654, -0.037, 0.15, -56, 0.227],
    [-0.338, 0.563, 0.14, -28, 0.211],
    [0.397, -0.609, 0.129, -112, 0.194],
    [0.024, 0.295, 0.122, -5, 0.184],
    [0.429, 0.006, 0.115, -22, 0.173],
    [0.142, -0.271, 0.113, 26, 0.17],
    [0.461, 0.477, 0.108, 136, 0.17],
    [-0.33, -0.353, 0.103, -15, 0.17],
  ]),
  template('cascade', [
    [-0.54, -0.449, 0.15, 52, 0.227],
    [-0.055, -0.35, 0.14, 13, 0.211],
    [-0.06, 0.462, 0.129, -12, 0.194],
    [0.274, -0.675, 0.122, -144, 0.184],
    [0.695, 0.153, 0.115, 42, 0.173],
    [0.318, 0.28, 0.113, 19, 0.17],
    [-0.452, 0.611, 0.108, -155, 0.17],
    [-0.281, 0.1, 0.103, 52, 0.17],
  ]),
  template('delta', [
    [0.086, 0.088, 0.15, 159, 0.227],
    [0.563, 0.208, 0.14, 54, 0.211],
    [0.686, -0.235, 0.129, 89, 0.194],
    [-0.578, 0.037, 0.122, 77, 0.184],
    [-0.295, 0.336, 0.115, 106, 0.173],
    [-0.454, -0.471, 0.113, 12, 0.17],
    [0.151, 0.663, 0.108, -86, 0.17],
    [-0.105, -0.663, 0.103, 119, 0.17],
  ]),
  template('ember', [
    [0.056, -0.224, 0.15, -92, 0.227],
    [-0.309, -0.555, 0.14, 95, 0.211],
    [-0.478, 0.499, 0.129, -170, 0.194],
    [0.281, 0.183, 0.122, -62, 0.184],
    [-0.457, -0.025, 0.115, 170, 0.173],
    [0.636, 0.385, 0.113, 5, 0.17],
    [-0.113, 0.292, 0.108, -17, 0.17],
    [0.354, -0.583, 0.103, -173, 0.17],
  ]),
  template('fjord', [
    [0.475, -0.518, 0.15, 15, 0.227],
    [0.552, 0.159, 0.14, 136, 0.211],
    [0.135, -0.186, 0.129, -70, 0.194],
    [-0.624, -0.291, 0.122, 158, 0.184],
    [0.205, 0.729, 0.115, -125, 0.173],
    [0.154, 0.335, 0.113, -2, 0.17],
    [-0.229, -0.395, 0.108, 52, 0.17],
    [-0.699, 0.111, 0.103, -106, 0.17],
  ]),
  template('glimmer', [
    [0.413, -0.289, 0.15, 123, 0.227],
    [0.325, 0.28, 0.14, 177, 0.211],
    [0.733, 0.066, 0.129, 31, 0.194],
    [-0.212, -0.041, 0.122, 20, 0.184],
    [-0.413, 0.586, 0.115, -61, 0.173],
    [-0.578, -0.436, 0.113, -9, 0.17],
    [-0.268, -0.681, 0.108, 121, 0.17],
    [-0.022, 0.669, 0.103, -39, 0.17],
  ]),
  template('harbor', [
    [0.385, -0.588, 0.15, -128, 0.227],
    [0.719, -0.022, 0.14, -141, 0.211],
    [-0.615, -0.236, 0.129, 131, 0.194],
    [-0.327, 0.088, 0.122, -119, 0.184],
    [-0.027, 0.655, 0.115, 3, 0.173],
    [-0.391, 0.495, 0.113, -16, 0.17],
    [0.284, -0.043, 0.108, -170, 0.17],
    [0.003, -0.321, 0.103, 27, 0.17],
  ]),
  template('isotope', [
    [-0.59, 0.344, 0.15, -21, 0.227],
    [0.113, -0.105, 0.14, -100, 0.211],
    [0.562, 0.16, 0.129, -127, 0.194],
    [0.168, 0.341, 0.122, 101, 0.184],
    [0.325, -0.488, 0.115, 67, 0.173],
    [0.134, 0.748, 0.113, -23, 0.17],
    [-0.208, -0.531, 0.108, -101, 0.17],
    [-0.629, -0.392, 0.103, 94, 0.17],
  ]),
  template('juno', [
    [-0.599, 0.065, 0.15, 87, 0.227],
    [0.114, -0.583, 0.14, -59, 0.211],
    [0.669, -0.228, 0.129, -27, 0.194],
    [-0.137, 0.014, 0.122, -38, 0.184],
    [0.169, 0.738, 0.115, 131, 0.173],
    [-0.316, -0.5, 0.113, -30, 0.17],
    [-0.065, 0.416, 0.108, -32, 0.17],
    [0.26, 0.146, 0.103, 161, 0.17],
  ]),
  template('kestrel', [
    [-0.594, -0.127, 0.15, -165, 0.227],
    [0.468, -0.257, 0.14, -18, 0.211],
    [0.725, 0.125, 0.129, 73, 0.194],
    [0.181, 0.333, 0.122, -176, 0.184],
    [-0.245, -0.418, 0.115, -163, 0.173],
    [-0.692, 0.314, 0.113, -37, 0.17],
    [0.011, -0.722, 0.108, 37, 0.17],
    [0.169, 0.741, 0.103, -131, 0.17],
  ]),
  template('lagoon', [
    [0.105, 0.685, 0.15, -57, 0.227],
    [-0.697, -0.18, 0.14, 23, 0.211],
    [0.346, -0.108, 0.129, 174, 0.194],
    [0.409, 0.321, 0.122, 44, 0.184],
    [0.629, -0.421, 0.115, -99, 0.173],
    [-0.066, -0.69, 0.113, -44, 0.17],
    [-0.274, 0.039, 0.108, 106, 0.17],
    [-0.606, 0.254, 0.103, -64, 0.17],
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

    if (slot.size <= 0 || slot.collisionRadius < slot.size * 1.5) {
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
    const swapIndex = state % (index + 1)
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
