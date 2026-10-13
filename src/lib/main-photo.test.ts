import { describe, expect, it } from 'vitest'
import { chooseMain, sampleForChoice, timingLabel } from './main-photo'

const shots = ['18:00', '18:20', '18:45', '19:30'].map((t) => ({
  storage_path: t,
  taken_at: `2026-10-01T${t}:00Z`,
}))

describe('chooseMain', () => {
  it('trusts a confident pick, wherever it falls', () => {
    expect(chooseMain(shots, 1, 'high')?.storage_path).toBe('18:00')
  })
  it('accepts a medium pick from late in the cook', () => {
    expect(chooseMain(shots, 3, 'medium')?.storage_path).toBe('18:45')
  })
  it('falls back to the last shot when a medium pick is early', () => {
    expect(chooseMain(shots, 1, 'medium')?.storage_path).toBe('19:30')
  })
  it('falls back to the last shot on a low or missing pick', () => {
    expect(chooseMain(shots, 2, 'low')?.storage_path).toBe('19:30')
    expect(chooseMain(shots, undefined, undefined)?.storage_path).toBe('19:30')
    expect(chooseMain(shots, 9, 'high')?.storage_path).toBe('19:30')
  })
})

describe('sampleForChoice', () => {
  it('keeps short series whole, in time order', () => {
    expect(sampleForChoice([...shots].reverse()).map((p) => p.storage_path)).toEqual([
      '18:00', '18:20', '18:45', '19:30',
    ])
  })
  it('keeps the opening and every late shot of a long series', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      storage_path: String(i),
      taken_at: `2026-10-01T18:${String(i * 4).padStart(2, '0')}:00Z`,
    }))
    expect(sampleForChoice(many).map((p) => p.storage_path)).toEqual(['0', '1', '6', '7', '8', '9', '10', '11'])
  })
})

describe('timingLabel', () => {
  it('counts minutes from the first shot', () => {
    expect(timingLabel(shots, 3)).toBe('90 min in')
  })
})
