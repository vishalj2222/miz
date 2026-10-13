import { describe, expect, it } from 'vitest'
import { cookDocument, toVector } from './embedding'

describe('cookDocument', () => {
  it('includes dish, ingredients, techniques, note and season', () => {
    const doc = cookDocument({
      cooked_at: '2025-04-12T19:00:00Z',
      note_raw: 'raw',
      extraction: {
        dish_name: 'Dan dan noodles',
        cuisine: 'Chinese',
        sub_region: 'Sichuan',
        ingredients: [{ name: 'peanuts' }, { name: 'chilli oil' }],
        techniques: ['stir-fry'],
        cleaned_note: 'Too spicy, great though.',
      },
    })
    expect(doc).toContain('Dan dan noodles')
    expect(doc).toContain('Chinese, Sichuan')
    expect(doc).toContain('Ingredients: peanuts, chilli oil')
    expect(doc).toContain('Techniques: stir-fry')
    expect(doc).toContain('Too spicy, great though.')
    expect(doc).not.toContain('raw')
    expect(doc).toContain('Cooked in spring, April 2025')
  })

  it('falls back to the raw note and skips empty fields', () => {
    const doc = cookDocument({ cooked_at: '2025-12-01T00:00:00Z', note_raw: 'just soup', extraction: {} })
    expect(doc).toBe('just soup\nCooked in winter, December 2025')
  })

  it('includes process photo captions', () => {
    const doc = cookDocument({
      cooked_at: 'bad', note_raw: 'ragu', extraction: {}, captions: ['searing at high heat', 'deglazing'],
    })
    expect(doc).toBe('ragu\nProcess: searing at high heat; deglazing')
  })

  it('handles a null extraction', () => {
    expect(cookDocument({ cooked_at: 'bad', note_raw: '', extraction: null })).toBe('')
  })
})

describe('toVector', () => {
  it('formats a pgvector literal', () => {
    expect(toVector([0.1, -2, 3])).toBe('[0.1,-2,3]')
  })
})
