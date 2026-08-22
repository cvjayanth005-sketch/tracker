import { useEffect, useState } from 'react'

/**
 * True whenever the page is scrolled away from the very top.
 *
 * Deliberately position-based rather than direction-based: the bottom chrome
 * should stay compact for the whole time someone is down in a screen's
 * content — scrolling back up mid-page is still reading, not a request for
 * the full dock back. Only actually reaching the top restores it, which
 * makes the expanded state mean "you are at the start of this screen"
 * instead of "you happened to swipe upward a moment ago".
 */
export function useScrollCollapse(topThreshold = 12): boolean {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let ticking = false

    const evaluate = () => {
      ticking = false
      setCollapsed(window.scrollY > topThreshold)
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(evaluate)
    }

    // Seed from the current position: a restored scroll offset or an
    // already-scrolled route change should not start out expanded.
    evaluate()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [topThreshold])

  return collapsed
}
