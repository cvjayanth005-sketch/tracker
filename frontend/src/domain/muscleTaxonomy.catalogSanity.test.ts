import { describe, expect, it } from 'vitest'
import { classifyBodyPart } from './muscleTaxonomy'
import { EXERCISES } from './onboarding/catalog/exercises'

/**
 * Not a correctness test of individual mappings (see muscleTaxonomy.test.ts
 * for that) — a coverage check against the real 100+-exercise catalogue, so
 * a regex gap that only shows up on real exercise names doesn't ship
 * unnoticed. A name-based classifier will never be 100%; this pins how much
 * currently falls through, so a future change that quietly makes it worse
 * fails the build instead of just shipping.
 */
describe('classifyBodyPart against the real catalogue', () => {
  it('classifies the large majority of catalogue exercises', () => {
    const unclassified = EXERCISES.filter((e) => classifyBodyPart(e.name) === null)
    const rate = unclassified.length / EXERCISES.length
    if (rate > 0.1) {
      // eslint-disable-next-line no-console
      console.log('Unclassified:', unclassified.map((e) => e.name))
    }
    expect(rate).toBeLessThanOrEqual(0.1)
  })
})
