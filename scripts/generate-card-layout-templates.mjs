import { validateCardLayoutTemplate } from '../lib/card-layout.ts'

const TEMPLATE_NAMES = [
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

const SYMBOL_SIZES = [0.2, 0.175, 0.155, 0.135, 0.118, 0.102, 0.088, 0.076]
const COLLISION_RADII = [
  0.3024, 0.2646, 0.2344, 0.2041, 0.1784, 0.17, 0.17, 0.17,
]
const GENERATION_EDGE_PADDING = 0.07
const GENERATION_SLOT_GAP = 0.055
const CANDIDATES_PER_TEMPLATE = 300
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

for (
  let templateIndex = 0;
  templateIndex < TEMPLATE_NAMES.length;
  templateIndex += 1
) {
  let bestCandidate

  for (
    let candidateIndex = 0;
    candidateIndex < CANDIDATES_PER_TEMPLATE;
    candidateIndex += 1
  ) {
    const candidate = generateCandidate(
      0x71f00d + templateIndex * 100_003 + candidateIndex * 101,
    )

    if (
      candidate.minimumClearance >= -1e-6 &&
      (!bestCandidate || candidate.score > bestCandidate.score)
    ) {
      bestCandidate = candidate
    }
  }

  if (!bestCandidate) {
    throw new Error(`Unable to generate template ${templateIndex}.`)
  }

  const rotationRandom = createRandom(0xbada55 + templateIndex * 773)
  const templateName = TEMPLATE_NAMES[templateIndex]
  const slots = bestCandidate.points.map((point, slotIndex) => {
    const adjustment = CURATED_ADJUSTMENTS[templateName]?.[slotIndex]
    const size =
      CURATED_SIZE_OVERRIDES[templateName]?.[slotIndex] ??
      SYMBOL_SIZES[slotIndex]

    return [
      round(point.x + (adjustment?.x ?? 0)),
      round(point.y + (adjustment?.y ?? 0)),
      size,
      Math.round(rotationRandom() * 359 - 179),
      round(COLLISION_RADII[slotIndex]),
    ]
  })

  const errors = validateCardLayoutTemplate({
    id: templateName,
    slots: slots.map(([x, y, size, rotation, collisionRadius]) => ({
      x,
      y,
      size,
      rotation,
      collisionRadius,
    })),
  })

  if (errors.length > 0) {
    throw new Error(
      `Generated invalid template ${templateName}:\n${errors.join('\n')}`,
    )
  }

  console.log(`template('${templateName}', ${JSON.stringify(slots)}),`)
}

function generateCandidate(seed) {
  const random = createRandom(seed)
  const points = COLLISION_RADII.map((radius) => {
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
        const firstRadius = COLLISION_RADII[firstIndex]
        const secondRadius = COLLISION_RADII[secondIndex]

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
      const radius = COLLISION_RADII[index]

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

  const minimumClearance = getMinimumClearance(points)
  const centerX = average(points.map(({ x }) => x))
  const centerY = average(points.map(({ y }) => y))
  const balance = Math.hypot(centerX, centerY)
  const width = range(points.map(({ x }) => x))
  const height = range(points.map(({ y }) => y))

  return {
    minimumClearance,
    points,
    score:
      minimumClearance -
      balance * 0.65 -
      Math.abs(width - height) * 0.1 +
      (width + height) * 0.02,
  }
}

function getMinimumClearance(points) {
  let minimumClearance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const radius = COLLISION_RADII[index]

    if (!radius) {
      throw new Error('Unable to resolve a candidate collision radius.')
    }

    minimumClearance = Math.min(
      minimumClearance,
      1 - GENERATION_EDGE_PADDING - radius - Math.hypot(point.x, point.y),
    )

    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const otherPoint = points[otherIndex]
      const otherRadius = COLLISION_RADII[otherIndex]

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
