import type { Coordinate } from '@/shared/game/Coordinate'

import { localPlaneFor, planarDistance } from '@/domain/geo/LocalPlane'

// Trying every start is what makes the greedy walk reliable, and it costs one walk per
// marker; past this many markers a folder samples starts evenly instead, so a huge
// folder can't stall the click that asked for it.
const MAX_STARTS = 64
// 2-opt normally settles in a handful of passes. The cap is a backstop against a
// pathological board, not a tuning knob.
const MAX_IMPROVEMENT_PASSES = 24

interface Positioned {
  position: Coordinate
}

// Where a new stop belongs on a line that is already in order: the place that
// lengthens it least. A station added to a line is a stop between two others, not an
// extension past its terminus, and appending it there would double the line back on
// itself — so this is what "add to folder" uses instead of the end of the list.
//
// Cheapest insertion, one pass: every gap costs the detour through the new point minus
// the leg it replaces, and the two ends cost the leg out to it.
export function insertionIndexFor(line: Coordinate[], point: Coordinate): number {
  if (line.length < 2) {
    return line.length
  }
  const plane = localPlaneFor([...line, point])
  const stops = line.map(plane.project)
  const stop = plane.project(point)

  let best = 0
  let bestCost = Infinity
  for (let index = 0; index <= stops.length; index++) {
    const before = index > 0 ? stops[index - 1] : null
    const after = index < stops.length ? stops[index] : null
    const cost = before && after ?
      planarDistance(before, stop) + planarDistance(stop, after) - planarDistance(before, after) :
        planarDistance(stop, (before ?? after) as Coordinate)
    if (cost < bestCost) {
      best = index
      bestCost = cost
    }
  }

  return best
}

// Put markers in the order a line would visit them: the shortest open path through all
// of them. That's what turns a folder into a route — a board imported (or typed) in
// alphabetical order draws a line that criss-crosses the city, because the drawn line
// follows the order the panel lists.
//
// Shortest-path-through-every-point is the travelling salesman, so this is the usual
// pair of heuristics rather than an exact answer: a greedy nearest-neighbor walk from
// each candidate start (the best of those walks wins), then 2-opt, which repeatedly
// reverses the stretch between two markers whenever that shortens the path — exactly
// the move that undoes the crossings the greedy walk leaves behind. On markers strung
// along a real line this lands on the obvious answer; on a board that isn't a line it
// still gives an order the player can drag into place from.
//
// The result is a new array; the input is left alone.
export function orderAlongPath<Item extends Positioned>(items: Item[]): Item[] {
  if (items.length < 3) {
    return [...items]
  }

  const plane = localPlaneFor(items.map((item) => item.position))
  const points = items.map((item) => plane.project(item.position))
  const distance = distanceTable(points)

  let best: null | number[] = null
  let bestLength = Number.POSITIVE_INFINITY
  for (const start of candidateStarts(items.length)) {
    const walk = improve(nearestNeighborWalk(start, items.length, distance), distance)
    const length = pathLength(walk, distance)
    if (length < bestLength) {
      best = walk
      bestLength = length
    }
  }

  return facingTheOriginalWay(best ?? items.map((_, index) => index)).map((index) => items[index])
}

// Every start while a folder is small enough, and an even sample of them beyond that.
function candidateStarts(count: number): number[] {
  if (count <= MAX_STARTS) {
    return Array.from({ length: count }, (_, index) => index)
  }
  const stride = count / MAX_STARTS

  return Array.from({ length: MAX_STARTS }, (_, index) => Math.floor(index * stride))
}

function distanceTable(points: Coordinate[]): number[][] {
  return points.map((from) => points.map((to) => planarDistance(from, to)))
}

// A path is as short run either way, so which end comes first is a free choice: take
// the one that starts nearer the top of the list the player already has. Sorting a
// folder twice, or sorting one that was nearly right, then can't flip the line around
// for no visible reason.
function facingTheOriginalWay(path: number[]): number[] {
  return path[0] > path[path.length - 1] ? [...path].reverse() : path
}

// 2-opt for an open path: reverse the stretch between two positions whenever that
// shortens the whole path. Unlike the closed-tour version, reversing a stretch that
// runs to the end re-links only its start — there is no edge back to the beginning.
function improve(path: number[], distance: number[][]): number[] {
  const order = [...path]
  const last = order.length - 1
  for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass++) {
    let improved = false
    for (let from = 1; from <= last; from++) {
      for (let to = from + 1; to <= last; to++) {
        const before = distance[order[from - 1]][order[from]] +
          (to < last ? distance[order[to]][order[to + 1]] : 0)
        const after = distance[order[from - 1]][order[to]] +
          (to < last ? distance[order[from]][order[to + 1]] : 0)
        if (after < before) {
          reverse(order, from, to)
          improved = true
        }
      }
    }
    if (!improved) {
      return order
    }
  }

  return order
}

function nearestNeighborWalk(start: number, count: number, distance: number[][]): number[] {
  const visited = new Set<number>([start])
  const walk = [start]
  let current = start
  while (walk.length < count) {
    let next = -1
    let shortest = Number.POSITIVE_INFINITY
    for (let candidate = 0; candidate < count; candidate++) {
      if (!visited.has(candidate) && distance[current][candidate] < shortest) {
        next = candidate
        shortest = distance[current][candidate]
      }
    }
    visited.add(next)
    walk.push(next)
    current = next
  }

  return walk
}

function pathLength(path: number[], distance: number[][]): number {
  let total = 0
  for (let step = 1; step < path.length; step++) {
    total += distance[path[step - 1]][path[step]]
  }

  return total
}

function reverse(order: number[], from: number, to: number): void {
  let low = from
  let high = to
  while (low < high) {
    const held = order[low]
    order[low] = order[high]
    order[high] = held
    low++
    high--
  }
}
