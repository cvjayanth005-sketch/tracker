import { useEffect, useRef } from 'react'
import { liquidGlass, type LiquidGlassOptions } from '@/lib/liquid-glass.js'

/**
 * Real edge refraction on a single element.
 *
 * Where this is worth using — and where it is not:
 *
 * Each call builds a canvas displacement map and its own SVG filter, and the
 * filter then runs on the GPU every frame the element is on screen. That is
 * cheap for a handful of surfaces and expensive for a list of thirty. So the
 * app applies it to a few structural, long-lived panels (the tab bar, the
 * coach card, the hero stats) and leaves ordinary cards on the plain CSS
 * `.glass` dressing, which is visually close and costs nothing.
 *
 * Refraction is Chromium-only. Safari and Firefox get the frosted fallback
 * automatically, so nothing here may ever carry meaning — it is delight only.
 */
export function useLiquidGlass<T extends HTMLElement>(
  options: LiquidGlassOptions = {},
  enabled = true,
) {
  const ref = useRef<T | null>(null)
  // Keep the latest options without making them a re-init trigger; re-running
  // this effect rebuilds the map, which we only want on a real size change.
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    // Honour reduced-motion by skipping the optics entirely; the CSS glass
    // dressing underneath still reads correctly on its own.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const saveData =
      typeof navigator !== 'undefined' &&
      Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
    if (reduced || coarse || saveData) return

    const handle = liquidGlass(el, optionsRef.current)
    return () => handle.destroy()
  }, [enabled])

  return ref
}
