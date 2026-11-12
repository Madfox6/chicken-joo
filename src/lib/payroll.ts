import { computeDayPay, holidayMultiplier, type DayPay, type HolidayKind, type ShiftPayInput } from './pay'
import type { Holiday, Profile, TimeLog } from './types'

export function holidayOn(date: string, holidays: Holiday[]): HolidayKind | null {
  return holidays.find((holiday) => holiday.holiday_date === date)?.kind ?? null
}

export function logToPayInput(log: TimeLog, profile: Profile, holidays: Holiday[]): ShiftPayInput | null {
  if (!log.clock_out) return null
  return {
    shift: log.shift_code,
    workDate: log.work_date,
    clockIn: new Date(log.clock_in),
    clockOut: new Date(log.clock_out),
    dailyAllowance: profile.daily_allowance,
    otApproved: log.ot_approved,
    straightDuty: log.is_straight_duty,
    straightDutyApproved: log.straight_duty_approved,
    restDay: log.is_rest_day,
    holiday: holidayOn(log.work_date, holidays),
    lateWaived: log.late_waived,
    undertimeWaived: log.undertime_waived,
  }
}

export function holidayLabel(kind: HolidayKind | null, restDay: boolean): string | null {
  const rate = holidayMultiplier(kind, restDay)
  if (rate === 1) return null
  if (kind === 'regular') return 'Regular holiday · base × 1.5'
  if (kind === 'special') return 'Special holiday · base × 1.3'
  if (restDay) return 'Rest day · base × 1.3'
  return null
}

export function daysFromLogs(logs: TimeLog[], profile: Profile, holidays: Holiday[]): DayPay[] {
  const grouped = new Map<string, ShiftPayInput[]>()
  for (const log of logs) {
    const input = logToPayInput(log, profile, holidays)
    if (!input) continue
    const list = grouped.get(log.work_date) ?? []
    list.push(input)
    grouped.set(log.work_date, list)
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, shifts]) => computeDayPay(date, shifts, profile.role, profile.supervisor_addon))
}
