import { describe, expect, it } from 'vitest'
import { classifyDrag, shouldGoBack } from './swipe'

describe('classifyDrag', () => {
  it('claims mostly-horizontal rightward drags', () => {
    expect(classifyDrag(20, 4)).toBe('swipe')
  })
  it('yields mostly-vertical drags to scrolling', () => {
    expect(classifyDrag(5, 30)).toBe('scroll')
  })
  it('waits on tiny movements and leftward drags', () => {
    expect(classifyDrag(4, 3)).toBe('undecided')
    expect(classifyDrag(-30, 2)).toBe('undecided')
  })
})

describe('shouldGoBack', () => {
  it('commits past a third of the screen', () => {
    expect(shouldGoBack(140, 1000, 390)).toBe(true)
    expect(shouldGoBack(100, 1000, 390)).toBe(false)
  })
  it('commits on a quick flick even if short', () => {
    expect(shouldGoBack(80, 100, 390)).toBe(true)
  })
  it('never commits a leftward release', () => {
    expect(shouldGoBack(-200, 50, 390)).toBe(false)
  })
})
