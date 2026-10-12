import { describe, expect, it } from 'vitest'
import { cuisineCounts, type FeedItem } from './feed'

const item = (id: string, cuisine?: string | null): FeedItem => ({
  id,
  cookedAt: '2026-10-12T00:00:00Z',
  note: '',
  photoUrl: null,
  cuisine,
})

describe('cuisineCounts', () => {
  it('orders cuisines by most recent cook and counts them', () => {
    const items = [item('1', 'Thai'), item('2', 'Italian'), item('3', 'Thai'), item('4', 'Korean')]
    expect(cuisineCounts(items)).toEqual([
      { cuisine: 'Thai', count: 2 },
      { cuisine: 'Italian', count: 1 },
      { cuisine: 'Korean', count: 1 },
    ])
  })

  it('skips cooks with no cuisine yet', () => {
    expect(cuisineCounts([item('1'), item('2', null), item('3', ' '), item('4', 'Italian')])).toEqual([
      { cuisine: 'Italian', count: 1 },
    ])
  })
})
