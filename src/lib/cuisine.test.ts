import { describe, expect, it } from 'vitest'
import { mergeCuisine } from './cuisine'

describe('mergeCuisine', () => {
  const known = ['Italian', 'Japanese', 'Middle Eastern', 'American']
  it('folds a regional variant into the base cuisine', () => {
    expect(mergeCuisine('Southern Italian', known)).toBe('Italian')
    expect(mergeCuisine('Italian-American', known)).toBe('Italian')
    expect(mergeCuisine('Northern Middle Eastern', known)).toBe('Middle Eastern')
  })
  it('leaves new and exact cuisines alone', () => {
    expect(mergeCuisine('Italian', known)).toBe('Italian')
    expect(mergeCuisine('Thai', known)).toBe('Thai')
  })
  it('matches whole words only', () => {
    expect(mergeCuisine('Malaysian', ['Asian'])).toBe('Malaysian')
  })
})
