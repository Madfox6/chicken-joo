import { roundPeso } from './money'
import {
  classifyAttendance,
  nightHoursWorked,
  scheduledBounds,
  workDateFor,
  type ShiftCode,
} from './shifts'

/**
 * Chicken Joo pay. Weekly, Sunday–Saturday, Asia/Manila.
 *
 * - Base is ₱500 for 8 paid hours. The 9th clock hour is lunch and is never paid.
 * - Hourly rate is 500 / 8. Late and undertime use that rate per minute.
 * - Grace is 15 minutes. Inside the grace, deduction is ₱0.
 *   Past the grace, every late minute is deducted, including the first 15.
 *   8:16 is 16 minutes, not 1. Undertime uses the same rule.
 * - Daily allowance is set per person. It is paid in full even when they are late.
 *   An approved straight duty / double shift pays the allowance twice.
 * - Supervisor add-on is at most ₱100 per day, including a double shift.
 * - Night differential: Graveyard is a flat ₱50 per paid shift.
 *   Other shifts get 10% of the hourly base for hours actually worked from 10 PM–6 AM
 *   inside the schedule (PM 10 PM–1 AM, Mid PM 10 PM–5 AM). Early arrival and
 *   unapproved late clock-out do not add night differential.
 * - Regular holiday: base × 1.5. Special holiday: base × 1.3. Allowance is not multiplied.
 *   Rest day is base × 1.3. Holiday and rest day do not stack; the higher rate is used.
 * - Approved overtime is 125% of the hourly base. It is not paid unless approved.
 *   Early clock-in is not overtime. Late clock-out is not overtime unless approved.
 * - Straight duty pays a second base, allowance, and night differential only after approval,
 *   and only if they actually stayed past the first shift. It is not overtime.
 * - Open shifts and missed clock-outs with no time are not in the pay total.
 */

export const BASE_DAILY = 500
export const PAID_HOURS = 8
export const GRACE_MINUTES = 15
export const HOURLY = BASE_DAILY / PAID_HOURS
export const OT_MULTIPLIER = 1.25
export const REST_DAY_MULTIPLIER = 1.3
export const REGULAR_HOLIDAY_MULTIPLIER = 1.5
export const SPECIAL_HOLIDAY_MULTIPLIER = 1.3
export const ND_RATE = 0.1
export const GRAVEYARD_ND = 50
export const SUPERVISOR_ADDON_CAP = 100

export type HolidayKind = 'regular' | 'special'
export type PayRole = 'staff' | 'supervisor' | 'sub_owner' | 'owner'

export type ShiftPayInput = {
  shift: ShiftCode
  workDate: string
  clockIn: Date
  clockOut: Date | null
  dailyAllowance: number
  otApproved: boolean
  straightDuty: boolean
  straightDutyApproved: boolean
  restDay: boolean
  holiday: HolidayKind | null
  lateWaived: boolean
  undertimeWaived: boolean
}

export type ShiftPay = {
  workDate: string
  shift: ShiftCode
  base: number
  allowance: number
  nightDiff: number
  otPay: number
  lateMinutes: number
  undertimeMinutes: number
  otMinutes: number
  lateDeduction: number
  undertimeDeduction: number
  paidUnits: number
  gross: number
  deductions: number
  net: number
  straightDutyPending: boolean
}

export type DayPay = {
  workDate: string
  shifts: ShiftPay[]
  base: number
  allowance: number
  supervisorAddon: number
  nightDiff: number
  otPay: number
  lateDeduction: number
  undertimeDeduction: number
  gross: number
  deductions: number
  net: number
}

export type Adjustments = {
  cashAdvance: number
  sss: number
  philhealth: number
  pagibig: number
}

export type WeekPay = DayPay & {
  days: DayPay[]
  cashAdvance: number
  sss: number
  philhealth: number
  pagibig: number
  thirteenthMonthAccrual: number
}

export function payableMinutes(rawMinutes: number): number {
  if (rawMinutes <= GRACE_MINUTES) return 0
  return rawMinutes
}

export function minuteDeduction(rawMinutes: number): number {
  const minutes = payableMinutes(rawMinutes)
  if (minutes <= 0) return 0
  return roundPeso((minutes * HOURLY) / 60)
}

export function holidayMultiplier(holiday: HolidayKind | null, restDay: boolean): number {
  const holidayRate =
    holiday === 'regular' ? REGULAR_HOLIDAY_MULTIPLIER : holiday === 'special' ? SPECIAL_HOLIDAY_MULTIPLIER : 1
  const restRate = restDay ? REST_DAY_MULTIPLIER : 1
  return Math.max(holidayRate, restRate)
}

export function thirteenthMonthAccrual(ytdBase: number): number {
  return roundPeso(ytdBase / 12)
}

export function clockInPreview(shift: ShiftCode, when: Date): {
  workDate: string
  lateMinutes: number
  deduction: number
  early: boolean
} {
  const workDate = workDateFor(shift, when)
  const math = classifyAttendance({
    shift,
    workDate,
    clockIn: when,
    clockOut: null,
    straightDuty: false,
  })
  const { start } = scheduledBounds(shift, workDate)
  return {
    workDate,
    lateMinutes: math.lateMinutes,
    deduction: minuteDeduction(math.lateMinutes),
    early: when.getTime() < start.getTime(),
  }
}

export function computeShiftPay(input: ShiftPayInput): ShiftPay | null {
  if (!input.clockOut) return null
  const math = classifyAttendance({
    shift: input.shift,
    workDate: input.workDate,
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    straightDuty: input.straightDuty,
  })
  const paidUnits = input.straightDuty && input.straightDutyApproved && math.workedPastFirstShift ? 2 : 1
  const multiplier = holidayMultiplier(input.holiday, input.restDay)
  const base = roundPeso(BASE_DAILY * paidUnits * multiplier)
  const allowance = roundPeso(Math.max(0, input.dailyAllowance) * paidUnits)
  const nightDiff = roundPeso(nightDifferential(input, paidUnits))
  const lateDeduction = input.lateWaived ? 0 : minuteDeduction(math.lateMinutes)
  const undertimeDeduction = input.undertimeWaived ? 0 : minuteDeduction(math.undertimeMinutes)
  const paidOtMinutes = input.otApproved ? math.otMinutes : 0
  const otPay = roundPeso((paidOtMinutes / 60) * HOURLY * OT_MULTIPLIER)
  const gross = roundPeso(base + allowance + nightDiff + otPay)
  const deductions = roundPeso(lateDeduction + undertimeDeduction)
  return {
    workDate: input.workDate,
    shift: input.shift,
    base,
    allowance,
    nightDiff,
    otPay,
    lateMinutes: math.lateMinutes,
    undertimeMinutes: math.undertimeMinutes,
    otMinutes: math.otMinutes,
    lateDeduction,
    undertimeDeduction,
    paidUnits,
    gross,
    deductions,
    net: roundPeso(gross - deductions),
    straightDutyPending: input.straightDuty && !input.straightDutyApproved && math.workedPastFirstShift,
  }
}

function nightDifferential(input: ShiftPayInput, units: number): number {
  if (!input.clockOut) return 0
  if (input.shift === 'graveyard') return GRAVEYARD_ND * units
  const hours = nightHoursWorked(input.shift, input.workDate, input.clockIn, input.clockOut)
  return hours * ND_RATE * HOURLY * units
}

export function computeDayPay(
  workDate: string,
  shifts: ShiftPayInput[],
  role: PayRole,
  supervisorAddon: number,
): DayPay {
  const parts = shifts
    .map((shift) => computeShiftPay(shift))
    .filter((shift): shift is ShiftPay => shift !== null)
  const addon =
    role === 'supervisor' && parts.length > 0
      ? roundPeso(Math.min(SUPERVISOR_ADDON_CAP, Math.max(0, supervisorAddon)))
      : 0
  const base = roundPeso(parts.reduce((sum, part) => sum + part.base, 0))
  const allowance = roundPeso(parts.reduce((sum, part) => sum + part.allowance, 0))
  const nightDiff = roundPeso(parts.reduce((sum, part) => sum + part.nightDiff, 0))
  const otPay = roundPeso(parts.reduce((sum, part) => sum + part.otPay, 0))
  const lateDeduction = roundPeso(parts.reduce((sum, part) => sum + part.lateDeduction, 0))
  const undertimeDeduction = roundPeso(parts.reduce((sum, part) => sum + part.undertimeDeduction, 0))
  const gross = roundPeso(base + allowance + nightDiff + otPay + addon)
  const deductions = roundPeso(lateDeduction + undertimeDeduction)
  return {
    workDate,
    shifts: parts,
    base,
    allowance,
    supervisorAddon: addon,
    nightDiff,
    otPay,
    lateDeduction,
    undertimeDeduction,
    gross,
    deductions,
    net: roundPeso(gross - deductions),
  }
}

export function emptyAdjustments(): Adjustments {
  return { cashAdvance: 0, sss: 0, philhealth: 0, pagibig: 0 }
}

export function computeWeekPay(days: DayPay[], adjustments: Adjustments = emptyAdjustments()): WeekPay {
  const blank = computeDayPay('', [], 'staff', 0)
  const base = roundPeso(days.reduce((sum, day) => sum + day.base, 0))
  const allowance = roundPeso(days.reduce((sum, day) => sum + day.allowance, 0))
  const supervisorAddon = roundPeso(days.reduce((sum, day) => sum + day.supervisorAddon, 0))
  const nightDiff = roundPeso(days.reduce((sum, day) => sum + day.nightDiff, 0))
  const otPay = roundPeso(days.reduce((sum, day) => sum + day.otPay, 0))
  const lateDeduction = roundPeso(days.reduce((sum, day) => sum + day.lateDeduction, 0))
  const undertimeDeduction = roundPeso(days.reduce((sum, day) => sum + day.undertimeDeduction, 0))
  const cashAdvance = roundPeso(Math.max(0, adjustments.cashAdvance))
  const sss = roundPeso(Math.max(0, adjustments.sss))
  const philhealth = roundPeso(Math.max(0, adjustments.philhealth))
  const pagibig = roundPeso(Math.max(0, adjustments.pagibig))
  const gross = roundPeso(base + allowance + supervisorAddon + nightDiff + otPay)
  const deductions = roundPeso(lateDeduction + undertimeDeduction + cashAdvance + sss + philhealth + pagibig)
  return {
    ...blank,
    days,
    base,
    allowance,
    supervisorAddon,
    nightDiff,
    otPay,
    lateDeduction,
    undertimeDeduction,
    cashAdvance,
    sss,
    philhealth,
    pagibig,
    gross,
    deductions,
    net: roundPeso(gross - deductions),
    thirteenthMonthAccrual: thirteenthMonthAccrual(base),
  }
}
