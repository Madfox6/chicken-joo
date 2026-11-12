import { describe, expect, it } from 'vitest'
import { atManila } from './manila'
import {
  BASE_DAILY,
  computeDayPay,
  computeShiftPay,
  computeWeekPay,
  minuteDeduction,
  thirteenthMonthAccrual,
  type ShiftPayInput,
} from './pay'

function am(overrides: Partial<ShiftPayInput> = {}): ShiftPayInput {
  return {
    shift: 'am',
    workDate: '2026-11-12',
    clockIn: atManila('2026-11-12', '08:00'),
    clockOut: atManila('2026-11-12', '17:00'),
    dailyAllowance: 80,
    otApproved: false,
    straightDuty: false,
    straightDutyApproved: false,
    restDay: false,
    holiday: null,
    lateWaived: false,
    undertimeWaived: false,
    ...overrides,
  }
}

function pay(overrides: Partial<ShiftPayInput> = {}) {
  const result = computeShiftPay(am(overrides))
  if (!result) throw new Error('expected a closed shift')
  return result
}

describe('late and undertime grace', () => {
  it('does not deduct a 15-minute late', () => {
    const result = pay({ clockIn: atManila('2026-11-12', '08:15') })
    expect(result.lateMinutes).toBe(15)
    expect(result.lateDeduction).toBe(0)
    expect(result.allowance).toBe(80)
  })

  it('deducts every late minute once grace is passed (8:16 is 16 minutes)', () => {
    const result = pay({ clockIn: atManila('2026-11-12', '08:16') })
    expect(result.lateMinutes).toBe(16)
    expect(result.lateDeduction).toBe(16.67)
    expect(minuteDeduction(16)).toBe(16.67)
    expect(result.allowance).toBe(80)
    expect(result.base).toBe(BASE_DAILY)
  })

  it('keeps the full allowance when someone is late', () => {
    const result = pay({ clockIn: atManila('2026-11-12', '09:00'), dailyAllowance: 100 })
    expect(result.lateMinutes).toBe(60)
    expect(result.lateDeduction).toBe(62.5)
    expect(result.allowance).toBe(100)
  })

  it('does not deduct a 15-minute undertime', () => {
    const result = pay({ clockOut: atManila('2026-11-12', '16:45') })
    expect(result.undertimeMinutes).toBe(15)
    expect(result.undertimeDeduction).toBe(0)
  })

  it('deducts every undertime minute past grace', () => {
    const result = pay({ clockOut: atManila('2026-11-12', '16:40') })
    expect(result.undertimeMinutes).toBe(20)
    expect(result.undertimeDeduction).toBe(20.83)
  })

  it('does not deduct lunch on top of the 8 paid hours', () => {
    const result = pay()
    expect(result.base).toBe(500)
    expect(result.lateDeduction).toBe(0)
    expect(result.undertimeDeduction).toBe(0)
    expect(result.otPay).toBe(0)
  })
})

describe('overtime', () => {
  it('does not pay early clock-in as overtime', () => {
    const result = pay({ clockIn: atManila('2026-11-12', '07:40') })
    expect(result.lateMinutes).toBe(0)
    expect(result.otMinutes).toBe(0)
    expect(result.otPay).toBe(0)
    expect(result.base).toBe(500)
  })

  it('does not pay a late clock-out unless overtime is approved', () => {
    const result = pay({ clockOut: atManila('2026-11-12', '18:00') })
    expect(result.otMinutes).toBe(60)
    expect(result.otPay).toBe(0)
    expect(result.undertimeDeduction).toBe(0)
  })

  it('pays approved overtime at 125% of the hourly base', () => {
    const result = pay({ clockOut: atManila('2026-11-12', '19:00'), otApproved: true })
    expect(result.otMinutes).toBe(120)
    expect(result.otPay).toBe(156.25)
  })
})

describe('night differential', () => {
  it('pays graveyard a flat ₱50, not 10% of the night hours', () => {
    const result = pay({
      shift: 'graveyard',
      clockIn: atManila('2026-11-12', '23:55'),
      clockOut: atManila('2026-11-13', '08:55'),
    })
    expect(result.nightDiff).toBe(50)
    expect(result.base).toBe(500)
  })

  it('pays PM 10% for 10 PM–1 AM', () => {
    const result = pay({
      shift: 'pm',
      clockIn: atManila('2026-11-12', '16:00'),
      clockOut: atManila('2026-11-13', '01:00'),
    })
    expect(result.nightDiff).toBe(18.75)
  })

  it('shortens PM night differential when they leave before 1 AM', () => {
    const result = pay({
      shift: 'pm',
      clockIn: atManila('2026-11-12', '16:00'),
      clockOut: atManila('2026-11-13', '00:00'),
    })
    expect(result.nightDiff).toBe(12.5)
    expect(result.undertimeMinutes).toBe(60)
  })

  it('pays Mid PM 10% for 10 PM–5 AM', () => {
    const result = pay({
      shift: 'mid_pm',
      clockIn: atManila('2026-11-12', '20:00'),
      clockOut: atManila('2026-11-13', '05:00'),
    })
    expect(result.nightDiff).toBe(43.75)
  })

  it('pays no night differential on AM', () => {
    expect(pay().nightDiff).toBe(0)
  })

  it('does not add night differential for arriving early or staying late', () => {
    const early = pay({
      shift: 'pm',
      clockIn: atManila('2026-11-12', '15:00'),
      clockOut: atManila('2026-11-13', '01:00'),
    })
    const late = pay({
      shift: 'pm',
      clockIn: atManila('2026-11-12', '16:00'),
      clockOut: atManila('2026-11-13', '02:00'),
    })
    expect(early.nightDiff).toBe(18.75)
    expect(late.nightDiff).toBe(18.75)
    expect(late.otMinutes).toBe(60)
    expect(late.otPay).toBe(0)
  })
})

describe('holidays and rest day', () => {
  it('pays a regular holiday at 1.5× base and leaves the allowance alone', () => {
    const result = pay({ holiday: 'regular', dailyAllowance: 90 })
    expect(result.base).toBe(750)
    expect(result.allowance).toBe(90)
  })

  it('pays a special holiday at 1.3× base only', () => {
    const result = pay({ holiday: 'special', dailyAllowance: 90 })
    expect(result.base).toBe(650)
    expect(result.allowance).toBe(90)
  })

  it('pays a rest day at 1.3× base', () => {
    expect(pay({ restDay: true }).base).toBe(650)
  })

  it('uses the higher of holiday and rest day instead of stacking them', () => {
    expect(pay({ restDay: true, holiday: 'regular' }).base).toBe(750)
    expect(pay({ restDay: true, holiday: 'special' }).base).toBe(650)
  })
})

describe('double shift and supervisor add-on', () => {
  const doubleOut = atManila('2026-11-13', '02:00')

  it('pays allowance and base twice when straight duty is approved', () => {
    const day = computeDayPay(
      '2026-11-12',
      [am({ straightDuty: true, straightDutyApproved: true, clockOut: doubleOut, dailyAllowance: 75 })],
      'staff',
      0,
    )
    expect(day.shifts[0].paidUnits).toBe(2)
    expect(day.base).toBe(1000)
    expect(day.allowance).toBe(150)
    expect(day.undertimeDeduction).toBe(0)
    expect(day.otPay).toBe(0)
  })

  it('pays a single shift when straight duty is not approved', () => {
    const day = computeDayPay(
      '2026-11-12',
      [am({ straightDuty: true, clockOut: doubleOut, dailyAllowance: 75 })],
      'staff',
      0,
    )
    expect(day.shifts[0].paidUnits).toBe(1)
    expect(day.base).toBe(500)
    expect(day.allowance).toBe(75)
    expect(day.shifts[0].straightDutyPending).toBe(true)
    expect(day.undertimeDeduction).toBe(0)
  })

  it('caps the supervisor add-on at ₱100 on a double shift', () => {
    const day = computeDayPay(
      '2026-11-12',
      [am({ straightDuty: true, straightDutyApproved: true, clockOut: doubleOut })],
      'supervisor',
      150,
    )
    expect(day.supervisorAddon).toBe(100)
    expect(day.base).toBe(1000)
    expect(day.allowance).toBe(160)
  })

  it('caps the supervisor add-on at ₱100 across two shifts in one day', () => {
    const day = computeDayPay(
      '2026-11-12',
      [
        am(),
        am({
          shift: 'pm',
          clockIn: atManila('2026-11-12', '16:00'),
          clockOut: atManila('2026-11-13', '01:00'),
        }),
      ],
      'supervisor',
      80,
    )
    expect(day.supervisorAddon).toBe(80)
    expect(day.allowance).toBe(160)
    expect(day.base).toBe(1000)
  })

  it('does not pay a supervisor add-on to staff', () => {
    const day = computeDayPay('2026-11-12', [am()], 'staff', 100)
    expect(day.supervisorAddon).toBe(0)
  })

  it('does not let a holiday multiply the allowance, night differential, or add-on', () => {
    const day = computeDayPay(
      '2026-11-12',
      [
        am({
          shift: 'graveyard',
          holiday: 'regular',
          straightDuty: true,
          straightDutyApproved: true,
          clockIn: atManila('2026-11-12', '23:55'),
          clockOut: atManila('2026-11-13', '17:55'),
          dailyAllowance: 50,
        }),
      ],
      'supervisor',
      100,
    )
    expect(day.base).toBe(1500)
    expect(day.allowance).toBe(100)
    expect(day.nightDiff).toBe(100)
    expect(day.supervisorAddon).toBe(100)
  })
})

describe('weekly pay', () => {
  it('subtracts cash advances and contributions and accrues 13th month from base', () => {
    const day = computeDayPay('2026-11-12', [am({ dailyAllowance: 50 })], 'staff', 0)
    const week = computeWeekPay([day], { cashAdvance: 100, sss: 20, philhealth: 10, pagibig: 10 })
    expect(week.gross).toBe(550)
    expect(week.deductions).toBe(140)
    expect(week.net).toBe(410)
    expect(week.thirteenthMonthAccrual).toBe(41.67)
    expect(thirteenthMonthAccrual(6000)).toBe(500)
  })

  it('leaves an open shift out of pay', () => {
    expect(computeShiftPay(am({ clockOut: null }))).toBeNull()
  })
})
