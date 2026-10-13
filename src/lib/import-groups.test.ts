import { describe, expect, it } from 'vitest'
import { groupIntoCooks } from './import-groups'

const at = (iso: string | null, name = iso) => ({ takenAt: iso, name })

describe('groupIntoCooks', () => {
  it('keeps one session together, in the order taken', () => {
    const g = groupIntoCooks([at('2026-10-01T19:40:00Z'), at('2026-10-01T18:00:00Z'), at('2026-10-01T19:00:00Z')])
    expect(g.map((x) => x.map((p) => p.name))).toEqual([
      ['2026-10-01T18:00:00Z', '2026-10-01T19:00:00Z', '2026-10-01T19:40:00Z'],
    ])
  })
  it('splits on a long gap', () => {
    const g = groupIntoCooks([at('2026-10-01T18:00:00Z'), at('2026-10-03T18:00:00Z')])
    expect(g).toHaveLength(2)
  })
  it('gives undated photos their own cook', () => {
    const g = groupIntoCooks([at(null, 'a'), at(null, 'b'), at('2026-10-01T18:00:00Z')])
    expect(g.map((x) => x.map((p) => p.name))).toEqual([['2026-10-01T18:00:00Z'], ['a'], ['b']])
  })
})
