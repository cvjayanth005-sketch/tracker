const INTRO_VERSION = 1
const INTRO_KEY_PREFIX = `formara.brand-intro.v${INTRO_VERSION}`
const SOUND_KEY = 'formara.sound-enabled.v1'

function introKey(userId: number): string {
  return `${INTRO_KEY_PREFIX}.${userId}`
}

export function hasSeenBrandIntro(userId: number, storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(introKey(userId)) === 'seen'
  } catch {
    return false
  }
}

export function markBrandIntroSeen(userId: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(introKey(userId), 'seen')
  } catch {
    // The in-memory App state still lets the user continue when storage is blocked.
  }
}

export function isBrandSoundEnabled(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setBrandSoundEnabled(enabled: boolean, storage: Storage = localStorage): void {
  try {
    storage.setItem(SOUND_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sound preference can remain session-only when storage is unavailable.
  }
}
