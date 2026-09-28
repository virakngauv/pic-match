import { validateCardLayoutTemplate } from '../lib/card-layout.ts'

const PRODUCTION_TEMPLATE_NAMES = [
  'aurora',
  'borealis',
  'cascade',
  'delta',
  'ember',
  'fjord',
  'glimmer',
  'harbor',
  'isotope',
  'juno',
  'kestrel',
  'lagoon',
]

const PRODUCTION_SYMBOL_SIZES = [
  0.2, 0.175, 0.155, 0.135, 0.118, 0.102, 0.088, 0.076,
]
const PRODUCTION_COLLISION_RADII = [
  0.3024, 0.2646, 0.2344, 0.2041, 0.1784, 0.17, 0.17, 0.17,
]
const CURATED_ADJUSTMENTS = {
  borealis: {
    5: { x: -0.437, y: -0.026 },
    6: { x: 0.034, y: -0.63 },
  },
  cascade: { 6: { x: -0.071, y: -0.16 } },
  glimmer: { 4: { x: 0.25, y: 0.279 } },
  isotope: { 2: { x: -0.303, y: 0.101 } },
}
const CURATED_SIZE_OVERRIDES = {
  borealis: { 5: 0.11, 6: 0.105, 7: 0.095 },
  cascade: { 5: 0.11, 6: 0.105, 7: 0.095 },
  glimmer: { 5: 0.11, 6: 0.105, 7: 0.095 },
  isotope: { 5: 0.11, 6: 0.105, 7: 0.095 },
}

// Per-count ladders for the solo decks. Each spans a meaningful slice of the
// 0.2 -> 0.076 reviewed range so small boards keep a size hierarchy instead of
// collapsing into evenly sized rings. Names continue the alphabetical run.
const SOLO_COUNT_CONFIGS = [
  {
    symbolCount: 3,
    templateNames: ['maple', 'nectar', 'orbit'],
    symbolSizes: [0.2, 0.145, 0.105],
  },
  {
    symbolCount: 4,
    templateNames: ['prairie', 'quiver', 'ripple'],
    symbolSizes: [0.2, 0.155, 0.118, 0.088],
  },
  {
    symbolCount: 6,
    templateNames: ['saffron', 'thicket', 'umbra'],
    symbolSizes: [0.19, 0.16, 0.135, 0.115, 0.098, 0.084],
  },
]

const GENERATION_EDGE_PADDING = 0.07
const GENERATION_SLOT_GAP = 0.055
const CANDIDATES_PER_TEMPLATE = 300

// Empty-space pressure for the solo counts: deterministic sample points across
// the usable card disk penalize candidates that leave one large uncovered
// region, the signature of a regular polygon centered on the card.
const EMPTY_SPACE_SAMPLE_COUNT = 48
const GOLDEN_ANGLE = 2.399963229728653
const EMPTY_SPACE_LARGEST_WEIGHT = 0.3
const EMPTY_SPACE_MEAN_WEIGHT = 0.2

// Collision radii follow the production rule: 1.512x the glyph size, floored
// at the minimum 48px tap target on a 288px card.
function collisionRadiusFor(size) {
  return Math.max(0.17, Math.round(size * 1.512 * 10_000) / 10_000)
}

const COUNT_CONFIGS = [
  {
    symbolCount: 8,
    templateNames: PRODUCTION_TEMPLATE_NAMES,
    symbolSizes: PRODUCTION_SYMBOL_SIZES,
    collisionRadii: PRODUCTION_COLLISION_RADII,
    usesEmptySpaceScoring: false,
  },
  ...SOLO_COUNT_CONFIGS.map((config) => ({
    ...config,
    collisionRadii: config.symbolSizes.map(collisionRadiusFor),
    usesEmptySpaceScoring: true,
  })),
]

let templateIndex = 0
const soloBlocks = []

for (const config of COUNT_CONFIGS) {
  const lines = config.templateNames.map((templateName) =>
    generateTemplate(templateName, config, templateIndex++),
  )

  if (config.symbolCount === 8) {
    lines.forEach((line) => console.log(`${line},`))
  } else {
    soloBlocks.push(
      `  ${config.symbolCount}: [\n    ${lines.join(',\n    ')},\n  ],`,
    )
  }
}

console.log('\n// SOLO_CARD_LAYOUT_TEMPLATES body:')
console.log(soloBlocks.join('\n'))

function generateTemplate(templateName, config, templateIndex) {
  let bestCandidate

  for (
    let candidateIndex = 0;
    candidateIndex < CANDIDATES_PER_TEMPLATE;
    candidateIndex += 1
  ) {
    const candidate = generateCandidate(
      0x71f00d + templateIndex * 100_003 + candidateIndex * 101,
      config,
    )

    if (
      candidate.minimumClearance >= -1e-6 &&
      (!bestCandidate || candidate.score > bestCandidate.score)
    ) {
      bestCandidate = candidate
    }
  }

  if (!bestCandidate) {
    throw new Error(`Unable to generate template ${templateName}.`)
  }

  const slots = bestCandidate.points.map((point, slotIndex) => {
    const adjustment = CURATED_ADJUSTMENTS[templateName]?.[slotIndex]
    const size =
      CURATED_SIZE_OVERRIDES[templateName]?.[slotIndex] ??
      config.symbolSizes[slotIndex]

    return [
      round(point.x + (adjustment?.x ?? 0)),
      round(point.y + (adjustment?.y ?? 0)),
      size,
      round(config.collisionRadii[slotIndex]),
    ]
  })

  const errors = validateCardLayoutTemplate({
    id: templateName,
    slots: slots.map(([x, y, size, collisionRadius]) => ({
      x,
      y,
      size,
      collisionRadius,
    })),
  })

  if (errors.length > 0) {
    throw new Error(
      `Generated invalid template ${templateName}:\n${errors.join('\n')}`,
    )
  }

  return `template('${templateName}', ${JSON.stringify(slots)})`
}

function generateCandidate(seed, config) {
  const radii = config.collisionRadii
  const random = createRandom(seed)
  const points = radii.map((radius) => {
    const limit = 1 - GENERATION_EDGE_PADDING - radius
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * limit

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    }
  })

  for (let iteration = 0; iteration < 3_000; iteration += 1) {
    let largestViolation = 0

    for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < points.length;
        secondIndex += 1
      ) {
        const firstPoint = points[firstIndex]
        const secondPoint = points[secondIndex]
        const firstRadius = radii[firstIndex]
        const secondRadius = radii[secondIndex]

        if (!firstPoint || !secondPoint || !firstRadius || !secondRadius) {
          throw new Error('Unable to resolve candidate slot geometry.')
        }

        let deltaX = secondPoint.x - firstPoint.x
        let deltaY = secondPoint.y - firstPoint.y
        let distance = Math.hypot(deltaX, deltaY)
        const requiredDistance =
          firstRadius + secondRadius + GENERATION_SLOT_GAP

        if (distance >= requiredDistance) {
          continue
        }

        largestViolation = Math.max(
          largestViolation,
          requiredDistance - distance,
        )

        if (distance < 1e-8) {
          const angle = random() * Math.PI * 2
          deltaX = Math.cos(angle)
          deltaY = Math.sin(angle)
          distance = 1
        }

        const push = (requiredDistance - distance) * 0.505
        const unitX = deltaX / distance
        const unitY = deltaY / distance
        firstPoint.x -= unitX * push
        firstPoint.y -= unitY * push
        secondPoint.x += unitX * push
        secondPoint.y += unitY * push
      }
    }

    points.forEach((point, index) => {
      const radius = radii[index]

      if (!radius) {
        throw new Error('Unable to resolve a candidate collision radius.')
      }

      const limit = 1 - GENERATION_EDGE_PADDING - radius
      const distance = Math.hypot(point.x, point.y)

      if (distance > limit) {
        largestViolation = Math.max(largestViolation, distance - limit)
        point.x *= limit / distance
        point.y *= limit / distance
      }
    })

    if (largestViolation < 1e-7) {
      break
    }
  }

  const minimumClearance = getMinimumClearance(points, radii)
  const centerX = average(points.map(({ x }) => x))
  const centerY = average(points.map(({ y }) => y))
  const balance = Math.hypot(centerX, centerY)
  const width = range(points.map(({ x }) => x))
  const height = range(points.map(({ y }) => y))

  let score =
    minimumClearance -
    balance * 0.65 -
    Math.abs(width - height) * 0.1 +
    (width + height) * 0.02

  if (config.usesEmptySpaceScoring) {
    const { largestGap, meanGap } = measureEmptySpace(points, radii)
    score -= largestGap * EMPTY_SPACE_LARGEST_WEIGHT
    score -= meanGap * EMPTY_SPACE_MEAN_WEIGHT
  }

  return {
    minimumClearance,
    points,
    score,
  }
}

/**
 * Samples deterministic points on a sunflower spiral across the usable card
 * disk and reports how far the emptiest sample sits from the nearest collision
 * envelope (or the card edge), plus the mean over all samples.
 */
function measureEmptySpace(points, radii) {
  let largestGap = 0
  let gapSum = 0

  for (
    let sampleIndex = 0;
    sampleIndex < EMPTY_SPACE_SAMPLE_COUNT;
    sampleIndex += 1
  ) {
    const distance =
      Math.sqrt((sampleIndex + 0.5) / EMPTY_SPACE_SAMPLE_COUNT) *
      (1 - GENERATION_EDGE_PADDING)
    const angle = sampleIndex * GOLDEN_ANGLE
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance

    let nearest = 1 - GENERATION_EDGE_PADDING - Math.hypot(x, y)
    points.forEach((point, index) => {
      const radius = radii[index]

      if (!radius) {
        throw new Error('Unable to measure empty space for a candidate.')
      }

      nearest = Math.min(nearest, Math.hypot(x - point.x, y - point.y) - radius)
    })

    largestGap = Math.max(largestGap, nearest)
    gapSum += nearest
  }

  return { largestGap, meanGap: gapSum / EMPTY_SPACE_SAMPLE_COUNT }
}

function getMinimumClearance(points, radii) {
  let minimumClearance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const radius = radii[index]

    if (!radius) {
      throw new Error('Unable to resolve a candidate collision radius.')
    }

    minimumClearance = Math.min(
      minimumClearance,
      1 - GENERATION_EDGE_PADDING - radius - Math.hypot(point.x, point.y),
    )

    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const otherPoint = points[otherIndex]
      const otherRadius = radii[otherIndex]

      if (!otherPoint || !otherRadius) {
        throw new Error('Unable to resolve paired candidate geometry.')
      }

      minimumClearance = Math.min(
        minimumClearance,
        Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) -
          radius -
          otherRadius -
          GENERATION_SLOT_GAP,
      )
    }
  })

  return minimumClearance
}

function createRandom(seed) {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function range(values) {
  return Math.max(...values) - Math.min(...values)
}

function round(value) {
  return Number(value.toFixed(3))
}
