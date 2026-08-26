import { describe, expect, it } from 'vitest'

import { createClaimStreakTracker } from './claim-streak'

const ROOM = 'bcdf2'

function incorrect(pairRevision: number | null = 0) {
  return { roomCode: ROOM, status: 'incorrect', pairRevision }
}

describe('claim streak tracker', () => {
  it('reports nothing below the threshold and fires at each threshold multiple', () => {
    const tracker = createClaimStreakTracker(10)

    for (let attempt = 1; attempt < 10; attempt += 1) {
      expect(tracker.record(incorrect())).toBeUndefined()
    }
    expect(tracker.record(incorrect())).toEqual({
      roomCode: ROOM,
      pairRevision: 0,
      incorrectInARow: 10,
    })

    for (let attempt = 11; attempt < 20; attempt += 1) {
      expect(tracker.record(incorrect())).toBeUndefined()
    }
    expect(tracker.record(incorrect())).toEqual({
      roomCode: ROOM,
      pairRevision: 0,
      incorrectInARow: 20,
    })
  })

  it('emits on the first incorrect claim when the threshold is 1', () => {
    const tracker = createClaimStreakTracker(1)

    expect(tracker.record(incorrect())).toEqual({
      roomCode: ROOM,
      pairRevision: 0,
      incorrectInARow: 1,
    })
    expect(tracker.record(incorrect())).toEqual({
      roomCode: ROOM,
      pairRevision: 0,
      incorrectInARow: 2,
    })
  })

  it('resets the streak when a claim scores', () => {
    const tracker = createClaimStreakTracker(10)

    for (let attempt = 0; attempt < 9; attempt += 1) tracker.record(incorrect())
    expect(
      tracker.record({ roomCode: ROOM, status: 'success', pairRevision: 0 }),
    ).toBeUndefined()

    for (let attempt = 0; attempt < 9; attempt += 1) {
      expect(tracker.record(incorrect(1))).toBeUndefined()
    }
    expect(tracker.record(incorrect(1))).toEqual({
      roomCode: ROOM,
      pairRevision: 1,
      incorrectInARow: 10,
    })
  })

  it('resets the streak when the dealt pair changes', () => {
    const tracker = createClaimStreakTracker(10)

    for (let attempt = 0; attempt < 9; attempt += 1)
      tracker.record(incorrect(4))
    for (let attempt = 0; attempt < 9; attempt += 1) {
      expect(tracker.record(incorrect(5))).toBeUndefined()
    }
    expect(tracker.record(incorrect(5))).toEqual({
      roomCode: ROOM,
      pairRevision: 5,
      incorrectInARow: 10,
    })
  })

  it('tracks rooms independently and drops entries on forget', () => {
    const tracker = createClaimStreakTracker(3)

    const otherRoom = {
      roomCode: 'aaaa1',
      status: 'incorrect',
      pairRevision: 0,
    }
    tracker.record(otherRoom)
    tracker.record(otherRoom)
    expect(tracker.record(incorrect())).toBeUndefined()
    expect(tracker.size()).toBe(2)
    expect(tracker.record(otherRoom)).toEqual({
      roomCode: 'aaaa1',
      pairRevision: 0,
      incorrectInARow: 3,
    })

    tracker.forget(ROOM)
    expect(tracker.size()).toBe(1)
    tracker.record(incorrect())
    tracker.record(incorrect())
    expect(tracker.size()).toBe(2)
    expect(tracker.record(incorrect())).toEqual({
      roomCode: ROOM,
      pairRevision: 0,
      incorrectInARow: 3,
    })
  })

  it('ignores statuses that are not incorrect claims', () => {
    const tracker = createClaimStreakTracker(2)

    for (const status of ['success', 'cooldown', 'stale', 'forbidden']) {
      expect(
        tracker.record({ roomCode: ROOM, status, pairRevision: 0 }),
      ).toBeUndefined()
    }
    expect(tracker.size()).toBe(0)

    expect(tracker.record(incorrect())).toBeUndefined()
    expect(
      tracker.record({ roomCode: ROOM, status: 'cooldown', pairRevision: 0 }),
    ).toBeUndefined()
    expect(tracker.record(incorrect())).toEqual({
      roomCode: ROOM,
      pairRevision: 0,
      incorrectInARow: 2,
    })
  })
})
