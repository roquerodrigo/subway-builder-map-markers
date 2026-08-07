import { describe, expect, it } from 'vitest'

import type { Coordinate } from '@/shared/game/Coordinate'

import { planarDistance } from '@/domain/geo/LocalPlane'
import { insertionIndexFor, orderAlongPath } from '@/domain/route/PathOrder'

interface Stop {
  name: string
  position: Coordinate
}

function makeStops(positions: Coordinate[]): Stop[] {
  return positions.map((position, index) => ({ name: `stop-${index}`, position }))
}

function pathLength(stops: Stop[]): number {
  let total = 0
  for (let step = 1; step < stops.length; step++) {
    total += planarDistance(stops[step - 1].position, stops[step].position)
  }

  return total
}

// The board this exists for: a line's stops, filed in alphabetical order.
function shuffled<Item>(items: Item[]): Item[] {
  const order = [...items]
  for (let index = 0; index < order.length; index++) {
    const target = (index * 7 + 3) % order.length
    const held = order[index]
    order[index] = order[target]
    order[target] = held
  }

  return order
}

describe('orderAlongPath', () => {
  describe('paths with nothing to order', () => {
    it.each([0, 1, 2])('leaves %i markers in the order they came', (count) => {
      const stops = makeStops(Array.from({ length: count }, (_, index): Coordinate => [index, 0]))
      expect(orderAlongPath(stops)).toEqual(stops)
    })

    it('returns a fresh array rather than the one it was given', () => {
      const stops = makeStops([[0, 0], [1, 0]])
      expect(orderAlongPath(stops)).not.toBe(stops)
    })
  })

  describe('the order it lands on', () => {
    it('strings a scrambled straight line back into its line', () => {
      const line = makeStops([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]])
      const ordered = orderAlongPath(shuffled(line))
      const names = ordered.map((stop) => stop.name)
      const forwards = line.map((stop) => stop.name)
      expect([names, [...names].reverse()]).toContainEqual(forwards)
    })

    // A path is as short run either way, so the tie is broken towards the list the
    // player already has: sorting a folder twice can't flip the line around.
    it('runs the path the way the folder already pointed', () => {
      expect(orderAlongPath(makeStops([[2, 0], [0, 0], [1, 0]])).map((stop) => stop.position))
        .toEqual([[2, 0], [1, 0], [0, 0]])
      expect(orderAlongPath(makeStops([[0, 0], [2, 0], [1, 0]])).map((stop) => stop.position))
        .toEqual([[0, 0], [1, 0], [2, 0]])
    })

    it('leaves a folder it already sorted exactly as it is', () => {
      const stops = makeStops([[2, 0], [0, 0], [3, 1], [1, 0]])
      const once = orderAlongPath(stops)
      expect(orderAlongPath(once)).toEqual(once)
    })

    it('keeps every marker exactly once', () => {
      const stops = makeStops([[0, 0], [3, 1], [1, 0], [2, 2], [4, 0], [1, 3], [2, 0]])
      const ordered = orderAlongPath(stops)
      expect(ordered).toHaveLength(stops.length)
      expect(new Set(ordered)).toEqual(new Set(stops))
    })

    it('returns the very same marker objects, untouched', () => {
      const stops = makeStops([[0, 0], [2, 0], [1, 0]])
      for (const stop of orderAlongPath(stops)) {
        expect(stops).toContain(stop)
      }
    })

    it('never lengthens a path that was already in order', () => {
      const line = makeStops([[0, 0], [1, 0.2], [2, 0], [3, 0.3], [4, 0]])
      expect(pathLength(orderAlongPath(line))).toBeLessThanOrEqual(pathLength(line) + 1e-12)
    })

    it('shortens the criss-cross an alphabetical board draws', () => {
      const line = makeStops([[0, 0], [1, 0.1], [2, 0], [3, 0.1], [4, 0], [5, 0.1], [6, 0]])
      const scrambled = shuffled(line)
      expect(pathLength(orderAlongPath(scrambled))).toBeLessThan(pathLength(scrambled))
    })

    // A greedy walk paints itself into a corner and doubles back; 2-opt is what
    // undoes the crossing it leaves behind.
    it('undoes a crossing the greedy walk alone would leave', () => {
      const stops = makeStops([[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1]])
      const ordered = orderAlongPath(stops)
      expect(pathLength(ordered)).toBeLessThanOrEqual(pathLength(stops) + 1e-12)
      expect(pathLength(ordered)).toBeLessThan(pathLength(makeStops([[0, 0], [2, 0], [4, 0], [5, 1], [3, 1], [1, 1]])))
    })

    it('orders a real line whose stops sit in a curve', () => {
      const curve: Coordinate[] = Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 11) * Math.PI

        return [Math.cos(angle), Math.sin(angle)]
      })
      const ordered = orderAlongPath(shuffled(makeStops(curve)))
      expect(pathLength(ordered)).toBeLessThan(pathLength(makeStops(curve)) * 1.05)
    })

    it('survives markers stacked on the same spot', () => {
      const stops = makeStops([[1, 0], [0, 0], [1, 0], [2, 0]])
      const ordered = orderAlongPath(stops)
      expect(new Set(ordered)).toEqual(new Set(stops))
      expect(ordered[0].position).toEqual([0, 0])
      expect(ordered[3].position).toEqual([2, 0])
    })
  })

  describe('geographic distances', () => {
    // On raw degrees, the marker 0.9° east would read as farther than the one 1°
    // north; on the ground at 60° it is much closer, and that is the neighbor a line
    // should visit next.
    // Four markers on the corners of a box 1.5° wide and 1° tall at 60° north: on the
    // ground that box is wider than it is tall the other way round (1.5° of longitude
    // is ~0.74° there), so the shortest path runs along the short east-west sides —
    // the opposite of what raw degrees would pick.
    it('measures distance on the ground, not in raw degrees', () => {
      const ordered = orderAlongPath(makeStops([[0, 60], [1.5, 60], [0, 61], [1.5, 61]]))
      const latitudes = ordered.map((stop) => stop.position[1])
      expect(latitudes[0]).toBe(latitudes[1])
      expect(latitudes[2]).toBe(latitudes[3])
      expect(latitudes[1]).not.toBe(latitudes[2])
    })
  })

  // Trying every start is what makes the greedy walk reliable, but a folder with
  // hundreds of markers has to stay a click, not a freeze.
  describe('a folder with many markers', () => {
    it('orders 300 markers strung along a line, quickly', () => {
      const line = makeStops(Array.from({ length: 300 }, (_, index): Coordinate => [index * 0.01, 0]))
      const started = performance.now()
      const ordered = orderAlongPath(shuffled(line))
      expect(performance.now() - started).toBeLessThan(3000)
      expect(pathLength(ordered)).toBeCloseTo(pathLength(line), 6)
    })
  })
})

describe('insertionIndexFor', () => {
  const line: Coordinate[] = [[0, 0], [1, 0], [2, 0], [3, 0]]

  // A station added to a line is a stop between two others: putting it at the end
  // would double the line back across the city.
  it('puts a stop in the gap it belongs to', () => {
    expect(insertionIndexFor(line, [1.5, 0.01])).toBe(2)
  })

  it('extends the line past a terminus when that is the nearest place', () => {
    expect(insertionIndexFor(line, [4, 0])).toBe(4)
    expect(insertionIndexFor(line, [-1, 0])).toBe(0)
  })

  it('takes the gap it sits beside, not the stop it sits nearest', () => {
    // Nearer to [3, 0] than to [1, 0], but the detour through the last gap is smaller
    // than doubling back from the terminus.
    expect(insertionIndexFor(line, [2.6, 0.4])).toBe(3)
  })

  it('has one answer for a line with nothing to insert between', () => {
    expect(insertionIndexFor([], [0, 0])).toBe(0)
    expect(insertionIndexFor([[0, 0]], [1, 1])).toBe(1)
  })

  // Raw degrees would read the eastward gap as the wider one at this latitude, and
  // drop the stop into the wrong place.
  it('measures the detour on the ground, not in raw degrees', () => {
    const northern: Coordinate[] = [[0, 60], [2, 60], [2, 60.6]]
    expect(insertionIndexFor(northern, [1, 60])).toBe(1)
  })
})
