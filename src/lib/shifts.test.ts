import { describe, expect, it } from 'vitest'
import { atManila } from './manila'
import { previousCountSlot, suggestShift, workDateFor } from './shifts'
import { pinToPassword, staffEmail } from './auth'

describe('work dates', () => {
  it('logs graveyard on the date it starts', () => {
    expect(workDateFor('graveyard', atManila('2026-11-12', '23:50'))).toBe('2026-11-12')
    expect(workDateFor('graveyard', atManila('2026-11-13', '00:30'))).toBe('2026-11-12')
    expect(workDateFor('graveyard', atManila('2026-11-13', '08:00'))).toBe('2026-11-12')
  })

  it('keeps a PM clock-in after midnight on the previous start date', () => {
    expect(workDateFor('pm', atManila('2026-11-13', '00:40'))).toBe('2026-11-12')
    expect(workDateFor('pm', atManila('2026-11-12', '16:05'))).toBe('2026-11-12')
  })

  it('uses the calendar date for AM', () => {
    expect(workDateFor('am', atManila('2026-11-12', '08:16'))).toBe('2026-11-12')
  })
})

describe('inventory chain', () => {
  it('verifies the previous counting shift', () => {
    expect(previousCountSlot('am', '2026-11-12')).toEqual({ shift: 'graveyard', workDate: '2026-11-11' })
    expect(previousCountSlot('pm', '2026-11-12')).toEqual({ shift: 'am', workDate: '2026-11-12' })
    expect(previousCountSlot('graveyard', '2026-11-12')).toEqual({ shift: 'pm', workDate: '2026-11-12' })
  })
})

describe('suggested shift', () => {
  it('follows the clock without forcing the choice', () => {
    expect(suggestShift(atManila('2026-11-12', '08:30'))).toBe('am')
    expect(suggestShift(atManila('2026-11-12', '12:00'))).toBe('mid_am')
    expect(suggestShift(atManila('2026-11-12', '16:00'))).toBe('pm')
    expect(suggestShift(atManila('2026-11-12', '20:00'))).toBe('mid_pm')
    expect(suggestShift(atManila('2026-11-12', '23:00'))).toBe('graveyard')
    expect(suggestShift(atManila('2026-11-13', '03:00'))).toBe('graveyard')
  })
})

describe('sign-in mapping', () => {
  it('turns a 4-digit PIN into a 6-character password', () => {
    expect(pinToPassword('1234')).toBe('CJ1234')
    expect(pinToPassword('1234').length).toBeGreaterThanOrEqual(6)
    expect(staffEmail(' owner01 ')).toBe('owner01@staff.chickenjoo.local')
  })
})
