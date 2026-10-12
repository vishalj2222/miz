import { describe, expect, it } from 'vitest'
import { firstNameFromEmail } from './names'

describe('firstNameFromEmail', () => {
  it('takes the leading letters and capitalises them', () => {
    expect(firstNameFromEmail('sahil.joshi4@gmail.com')).toBe('Sahil')
    expect(firstNameFromEmail('pierce_x@example.com')).toBe('Pierce')
    expect(firstNameFromEmail('VISHAL@mise.app')).toBe('Vishal')
  })
  it('falls back to the local part, or null', () => {
    expect(firstNameFromEmail('42chef@x.com')).toBe('42chef')
    expect(firstNameFromEmail(undefined)).toBeNull()
  })
})
