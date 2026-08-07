import { describe, expect, it } from 'vitest'

import { DEFAULT_MARKER_COLOR } from '@/domain/marker/MarkerPalette'
import { colorForMembership, INTERCHANGE_COLOR } from '@/domain/marker/MembershipColor'

const BLUE = '#1266af'
const GREEN = '#008162'
const FOLDER_COLORS = new Set([BLUE, GREEN])

describe('colorForMembership', () => {
  it('takes the color of the one folder it is on', () => {
    expect(colorForMembership(DEFAULT_MARKER_COLOR, [BLUE], FOLDER_COLORS)).toBe(BLUE)
  })

  // Where two lines meet neither line's color is right, so an interchange is black.
  it('goes black where two lines meet', () => {
    expect(colorForMembership(BLUE, [BLUE, GREEN], FOLDER_COLORS)).toBe(INTERCHANGE_COLOR)
  })

  it('takes the remaining line s color when it comes off the other', () => {
    expect(colorForMembership(INTERCHANGE_COLOR, [GREEN], FOLDER_COLORS)).toBe(GREEN)
  })

  it('leaves a marker no folder holds as it is', () => {
    expect(colorForMembership(BLUE, [], FOLDER_COLORS)).toBe(BLUE)
  })

  it('leaves it as it is when the folder has no color of its own', () => {
    expect(colorForMembership(BLUE, [null], FOLDER_COLORS)).toBe(BLUE)
  })

  // A color that came from somewhere else is a choice the player made.
  it('keeps a color the player picked', () => {
    expect(colorForMembership('#ff00ff', [BLUE], FOLDER_COLORS)).toBe('#ff00ff')
  })

  it('takes over from the default a new marker starts with', () => {
    expect(colorForMembership(DEFAULT_MARKER_COLOR, [GREEN], FOLDER_COLORS)).toBe(GREEN)
  })

  it('takes over from another folder s color', () => {
    expect(colorForMembership(GREEN, [BLUE], FOLDER_COLORS)).toBe(BLUE)
  })

  it('says nothing when the color is already right', () => {
    expect(colorForMembership(BLUE, [BLUE], FOLDER_COLORS)).toBe(BLUE)
    expect(colorForMembership(INTERCHANGE_COLOR, [BLUE, GREEN], FOLDER_COLORS)).toBe(INTERCHANGE_COLOR)
  })
})
