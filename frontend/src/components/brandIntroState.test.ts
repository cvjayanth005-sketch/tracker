import { describe, expect, it } from 'vitest'
import {
  hasSeenBrandIntro,
  isBrandSoundEnabled,
  markBrandIntroSeen,
  setBrandSoundEnabled,
} from './brandIntroState'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('brand intro state', () => {
  it('records completion independently for each account', () => {
    const storage = new MemoryStorage()

    markBrandIntroSeen(12, storage)

    expect(hasSeenBrandIntro(12, storage)).toBe(true)
    expect(hasSeenBrandIntro(13, storage)).toBe(false)
  })

  it('defaults sound on and remembers an explicit mute', () => {
    const storage = new MemoryStorage()

    expect(isBrandSoundEnabled(storage)).toBe(true)
    setBrandSoundEnabled(false, storage)
    expect(isBrandSoundEnabled(storage)).toBe(false)
  })
})
