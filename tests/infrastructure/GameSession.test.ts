import { describe, expect, it } from 'vitest'

import type { GameStateSnapshot, StoreCallbacks } from '@/shared/game/StoreCallbacks'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { GameSession } from '@/infrastructure/store/GameSession'

function apiWithCityCode(cityCode: string): SubwayBuilderApi {
  return { utils: { getCityCode: () => cityCode } }
}

function storeWith(state: GameStateSnapshot): StoreCallbacks {
  return { getState: () => state }
}

const throwingStore: StoreCallbacks = {
  getState: () => {
    throw new Error('the internal store moved')
  },
}

describe('GameSession', () => {
  describe('cityCode', () => {
    it('reads the city code from the public api', () => {
      const session = new GameSession(apiWithCityCode('sao-paulo'), storeWith({ cityCode: 'stale' }))
      expect(session.cityCode()).toBe('sao-paulo')
    })

    it('falls back to the internal store when the api does not expose a getter', () => {
      const session = new GameSession({ utils: {} }, storeWith({ cityCode: 'sao-paulo' }))
      expect(session.cityCode()).toBe('sao-paulo')
    })

    it('falls back to the internal store when the api has no utils at all', () => {
      const session = new GameSession({}, storeWith({ cityCode: 'sao-paulo' }))
      expect(session.cityCode()).toBe('sao-paulo')
    })

    it('falls back to the internal store when the api returns an empty city code', () => {
      const session = new GameSession(apiWithCityCode(''), storeWith({ cityCode: 'sao-paulo' }))
      expect(session.cityCode()).toBe('sao-paulo')
    })

    it('returns null when neither source knows the city', () => {
      const session = new GameSession({}, storeWith({}))
      expect(session.cityCode()).toBeNull()
    })

    it('returns null when the internal store reports an empty city code', () => {
      const session = new GameSession({}, storeWith({ cityCode: '' }))
      expect(session.cityCode()).toBeNull()
    })

    it('returns null when there is no internal store handle', () => {
      const session = new GameSession({}, null)
      expect(session.cityCode()).toBeNull()
    })

    it('returns null instead of throwing when the internal store throws', () => {
      const session = new GameSession({}, throwingStore)
      expect(session.cityCode()).toBeNull()
    })
  })

  describe('saveId', () => {
    it('reads the loaded save id from the internal store', () => {
      const session = new GameSession({}, storeWith({ currentSaveInfo: { id: '/saves/a.metro' } }))
      expect(session.saveId()).toBe('/saves/a.metro')
    })

    it('returns null when no save is loaded', () => {
      const session = new GameSession({}, storeWith({ currentSaveInfo: null }))
      expect(session.saveId()).toBeNull()
    })

    it('returns null when the loaded save has no id', () => {
      const session = new GameSession({}, storeWith({ currentSaveInfo: { name: 'Autosave' } }))
      expect(session.saveId()).toBeNull()
    })

    it('returns null when the loaded save id is empty', () => {
      const session = new GameSession({}, storeWith({ currentSaveInfo: { id: '' } }))
      expect(session.saveId()).toBeNull()
    })

    it('returns null when there is no internal store handle', () => {
      const session = new GameSession({}, null)
      expect(session.saveId()).toBeNull()
    })

    it('returns null instead of throwing when the internal store throws', () => {
      const session = new GameSession({}, throwingStore)
      expect(session.saveId()).toBeNull()
    })

    it('ignores the public api, which does not expose the loaded save', () => {
      const session = new GameSession(apiWithCityCode('sao-paulo'), storeWith({}))
      expect(session.saveId()).toBeNull()
    })
  })
})
