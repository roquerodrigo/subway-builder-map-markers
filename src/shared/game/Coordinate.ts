// A map coordinate as the game/map store it: [lng, lat]. Kept as a fixed tuple so
// the geometry code can index [0]/[1] without widening to a loose number[].
export type Coordinate = [number, number]
