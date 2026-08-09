declare module '@/lib/liquid-glass.js' {
  export interface LiquidGlassOptions {
    /** Displacement strength; negative = magnifying bulge. -60 subtle … -180 dramatic. */
    scale?: number
    /** Per-channel scale stagger producing the prism fringe. 0 disables. */
    chroma?: number
    /** Neutral interior inset as a fraction of the smaller side. */
    border?: number
    /** Curvature of the bulge: small = hard rim, large = dome. */
    mapBlur?: number
    /** Backdrop blur inside the glass; raise for busy backdrops. */
    blur?: number
    saturate?: number
    /** Corner radius override in px; defaults to the element's border-radius. */
    radius?: number | null
    /** Frosted blur used on Safari/Firefox, which cannot refract. */
    fallbackBlur?: number
  }

  export interface LiquidGlassHandle {
    /** False on Safari/Firefox, where the frosted fallback is applied instead. */
    supported: boolean
    /** Regenerate the displacement map after a manual size change. */
    refresh: () => void
    destroy: () => void
  }

  export function liquidGlass(
    el: HTMLElement,
    opts?: LiquidGlassOptions,
  ): LiquidGlassHandle
}
