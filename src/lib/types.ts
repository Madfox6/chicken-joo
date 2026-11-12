import type { ShiftCode } from './shifts'

export type Role = 'staff' | 'supervisor' | 'sub_owner' | 'owner'
export type LogStatus = 'open' | 'needs_review' | 'pending' | 'auto_approved' | 'approved'
export type HolidayKind = 'regular' | 'special'
export type CountPhase = 'start' | 'end'
export type AreaCode = 'cashier' | 'kitchen' | 'cashier_kitchen'

export type Branch = {
  id: string
  code: string
  name: string
  city: string
  active: boolean
}

export type Profile = {
  id: string
  employee_code: string
  full_name: string
  role: Role
  branch_id: string | null
  daily_allowance: number
  supervisor_addon: number
  leave_balance: number
  active: boolean
}

export type TimeLog = {
  id: string
  client_id: string
  employee_id: string
  branch_id: string
  shift_code: ShiftCode
  work_date: string
  clock_in: string
  clock_out: string | null
  selfie_in_path: string | null
  selfie_out_path: string | null
  gps_in_lat: number | null
  gps_in_lng: number | null
  gps_in_warning: string | null
  gps_out_lat: number | null
  gps_out_lng: number | null
  gps_out_warning: string | null
  late_minutes: number
  undertime_minutes: number
  ot_minutes: number
  ot_approved: boolean
  ot_rejected: boolean
  is_straight_duty: boolean
  straight_duty_approved: boolean
  straight_duty_rejected: boolean
  is_rest_day: boolean
  late_waived: boolean
  undertime_waived: boolean
  missed_clock_out: boolean
  issues_reviewed: boolean
  status: LogStatus
  review_note: string | null
}

export type Item = {
  id: string
  name: string
  unit: string
  is_sample: boolean
  active: boolean
  sort_order: number
}

export type BranchArea = {
  id: string
  branch_id: string
  area: AreaCode
}

export type Holiday = {
  id: string
  holiday_date: string
  name: string
  kind: HolidayKind
}

export type Adjustment = {
  id: string
  employee_id: string
  week_start: string
  cash_advance: number
  sss: number
  philhealth: number
  pagibig: number
  notes: string | null
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function dateOnly(value: unknown): string {
  return String(value).slice(0, 10)
}

export function asBranch(row: Record<string, unknown>): Branch {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    city: String(row.city),
    active: Boolean(row.active),
  }
}

export function asProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    employee_code: String(row.employee_code),
    full_name: String(row.full_name),
    role: row.role as Role,
    branch_id: row.branch_id ? String(row.branch_id) : null,
    daily_allowance: num(row.daily_allowance, 50),
    supervisor_addon: num(row.supervisor_addon),
    leave_balance: num(row.leave_balance),
    active: Boolean(row.active),
  }
}

export function asTimeLog(row: Record<string, unknown>): TimeLog {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    employee_id: String(row.employee_id),
    branch_id: String(row.branch_id),
    shift_code: row.shift_code as ShiftCode,
    work_date: dateOnly(row.work_date),
    clock_in: String(row.clock_in),
    clock_out: row.clock_out ? String(row.clock_out) : null,
    selfie_in_path: row.selfie_in_path ? String(row.selfie_in_path) : null,
    selfie_out_path: row.selfie_out_path ? String(row.selfie_out_path) : null,
    gps_in_lat: row.gps_in_lat == null ? null : num(row.gps_in_lat),
    gps_in_lng: row.gps_in_lng == null ? null : num(row.gps_in_lng),
    gps_in_warning: row.gps_in_warning ? String(row.gps_in_warning) : null,
    gps_out_lat: row.gps_out_lat == null ? null : num(row.gps_out_lat),
    gps_out_lng: row.gps_out_lng == null ? null : num(row.gps_out_lng),
    gps_out_warning: row.gps_out_warning ? String(row.gps_out_warning) : null,
    late_minutes: num(row.late_minutes),
    undertime_minutes: num(row.undertime_minutes),
    ot_minutes: num(row.ot_minutes),
    ot_approved: Boolean(row.ot_approved),
    ot_rejected: Boolean(row.ot_rejected),
    is_straight_duty: Boolean(row.is_straight_duty),
    straight_duty_approved: Boolean(row.straight_duty_approved),
    straight_duty_rejected: Boolean(row.straight_duty_rejected),
    is_rest_day: Boolean(row.is_rest_day),
    late_waived: Boolean(row.late_waived),
    undertime_waived: Boolean(row.undertime_waived),
    missed_clock_out: Boolean(row.missed_clock_out),
    issues_reviewed: Boolean(row.issues_reviewed),
    status: row.status as LogStatus,
    review_note: row.review_note ? String(row.review_note) : null,
  }
}

export function asItem(row: Record<string, unknown>): Item {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit),
    is_sample: Boolean(row.is_sample),
    active: Boolean(row.active),
    sort_order: num(row.sort_order),
  }
}

export function asArea(row: Record<string, unknown>): BranchArea {
  return {
    id: String(row.id),
    branch_id: String(row.branch_id),
    area: row.area as AreaCode,
  }
}

export function asHoliday(row: Record<string, unknown>): Holiday {
  return {
    id: String(row.id),
    holiday_date: dateOnly(row.holiday_date),
    name: String(row.name),
    kind: row.kind as HolidayKind,
  }
}

export function asAdjustment(row: Record<string, unknown>): Adjustment {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    week_start: dateOnly(row.week_start),
    cash_advance: num(row.cash_advance),
    sss: num(row.sss),
    philhealth: num(row.philhealth),
    pagibig: num(row.pagibig),
    notes: row.notes ? String(row.notes) : null,
  }
}
