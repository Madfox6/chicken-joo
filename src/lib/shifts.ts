import { addDays, atManila, manilaParts } from './manila'

export type ShiftCode = 'am' | 'mid_am' | 'pm' | 'mid_pm' | 'graveyard'
export type CountShift = 'am' | 'pm' | 'graveyard'

export type ShiftDef = {
  code: ShiftCode
  label: string
  start: string
  end: string
  crossesMidnight: boolean
  countsInventory: boolean
}

/** Every branch runs all five. A shift is 9 hours on the clock: 8 paid + 1 hour lunch. */
export const SHIFTS: Record<ShiftCode, ShiftDef> = {
  am: { code: 'am', label: 'AM', start: '08:00', end: '17:00', crossesMidnight: false, countsInventory: true },
  mid_am: { code: 'mid_am', label: 'Mid AM', start: '12:00', end: '21:00', crossesMidnight: false, countsInventory: false },
  pm: { code: 'pm', label: 'PM', start: '16:00', end: '01:00', crossesMidnight: true, countsInventory: true },
  mid_pm: { code: 'mid_pm', label: 'Mid PM', start: '20:00', end: '05:00', crossesMidnight: true, countsInventory: false },
  graveyard: { code: 'graveyard', label: 'Graveyard', start: '23:55', end: '08:55', crossesMidnight: true, countsInventory: true },
}

export const SHIFT_ORDER: ShiftCode[] = ['am', 'mid_am', 'pm', 'mid_pm', 'graveyard']

export const AREA_LABEL: Record<string, string> = {
  cashier: 'Cashier',
  kitchen: 'Kitchen',
  cashier_kitchen: 'Cashier / Kitchen',
}

export function isCountShift(shift: ShiftCode): shift is CountShift {
  return SHIFTS[shift].countsInventory
}

export function suggestShift(now = new Date()): ShiftCode {
  const { hour, minute } = manilaParts(now)
  const mins = hour * 60 + minute
  if (mins >= 5 * 60 && mins < 10 * 60) return 'am'
  if (mins >= 10 * 60 && mins < 14 * 60) return 'mid_am'
  if (mins >= 14 * 60 && mins < 18 * 60) return 'pm'
  if (mins >= 18 * 60 && mins < 22 * 60) return 'mid_pm'
  return 'graveyard'
}

/**
 * Graveyard is logged on the date it starts (11:55 PM), even after midnight.
 * PM and Mid PM clock-ins after midnight still belong to the shift that started the evening before.
 */
export function workDateFor(shift: ShiftCode, clock: Date): string {
  const parts = manilaParts(clock)
  const def = SHIFTS[shift]
  const [endHour, endMinute] = def.end.split(':').map(Number)
  const minutes = parts.hour * 60 + parts.minute
  const endMinutes = endHour * 60 + endMinute
  if (shift === 'graveyard') {
    if (minutes < 12 * 60) return addDays(parts.iso, -1)
    return parts.iso
  }
  if (def.crossesMidnight && minutes < endMinutes) return addDays(parts.iso, -1)
  return parts.iso
}

export function scheduledBounds(shift: ShiftCode, workDate: string): { start: Date; end: Date } {
  const def = SHIFTS[shift]
  const start = atManila(workDate, def.start)
  const endDate = def.crossesMidnight ? addDays(workDate, 1) : workDate
  const end = atManila(endDate, def.end)
  return { start, end }
}

export function positiveMinutes(from: Date, to: Date): number {
  const diff = Math.floor((to.getTime() - from.getTime()) / 60000)
  return diff > 0 ? diff : 0
}

export type AttendanceMath = {
  lateMinutes: number
  undertimeMinutes: number
  otMinutes: number
  workedPastFirstShift: boolean
}

/**
 * Late is measured from the scheduled start. Early arrival is not overtime.
 * Undertime is leaving before the single 9-hour end.
 * Time after that end is overtime only when straight duty is off.
 * Straight duty extends the day by another 9 hours; time inside that second
 * block is the double shift (paid only after approval), not overtime.
 * Overtime on a straight duty is only the time past the second end.
 */
export function classifyAttendance(input: {
  shift: ShiftCode
  workDate: string
  clockIn: Date
  clockOut: Date | null
  straightDuty: boolean
}): AttendanceMath {
  const { start, end } = scheduledBounds(input.shift, input.workDate)
  const doubleEnd = new Date(end.getTime() + 9 * 60 * 60 * 1000)
  const lateMinutes = positiveMinutes(start, input.clockIn)
  if (!input.clockOut) {
    return { lateMinutes, undertimeMinutes: 0, otMinutes: 0, workedPastFirstShift: false }
  }
  if (input.clockOut.getTime() < end.getTime()) {
    return {
      lateMinutes,
      undertimeMinutes: positiveMinutes(input.clockOut, end),
      otMinutes: 0,
      workedPastFirstShift: false,
    }
  }
  const workedPastFirstShift = input.clockOut.getTime() > end.getTime()
  if (input.straightDuty) {
    return {
      lateMinutes,
      undertimeMinutes: 0,
      otMinutes: positiveMinutes(doubleEnd, input.clockOut),
      workedPastFirstShift,
    }
  }
  return {
    lateMinutes,
    undertimeMinutes: 0,
    otMinutes: positiveMinutes(end, input.clockOut),
    workedPastFirstShift,
  }
}

/** Inventory chain: Graveyard (D-1) → AM (D) → PM (D) → Graveyard (D). */
export function previousCountSlot(
  shift: CountShift,
  workDate: string,
): { shift: CountShift; workDate: string } {
  if (shift === 'am') return { shift: 'graveyard', workDate: addDays(workDate, -1) }
  if (shift === 'pm') return { shift: 'am', workDate }
  return { shift: 'pm', workDate }
}

export function nightWindow(shift: ShiftCode, workDate: string): { start: Date; end: Date } | null {
  if (shift === 'pm') {
    return { start: atManila(workDate, '22:00'), end: atManila(addDays(workDate, 1), '01:00') }
  }
  if (shift === 'mid_pm') {
    return { start: atManila(workDate, '22:00'), end: atManila(addDays(workDate, 1), '05:00') }
  }
  return null
}

export function nightHoursWorked(shift: ShiftCode, workDate: string, clockIn: Date, clockOut: Date): number {
  const window = nightWindow(shift, workDate)
  if (!window) return 0
  const { start, end } = scheduledBounds(shift, workDate)
  const clippedStart = Math.max(clockIn.getTime(), start.getTime())
  const clippedEnd = Math.min(clockOut.getTime(), end.getTime())
  if (clippedEnd <= clippedStart) return 0
  const overlapStart = Math.max(clippedStart, window.start.getTime())
  const overlapEnd = Math.min(clippedEnd, window.end.getTime())
  if (overlapEnd <= overlapStart) return 0
  return (overlapEnd - overlapStart) / 3600000
}
