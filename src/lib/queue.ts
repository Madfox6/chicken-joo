import { workDateFor, type ShiftCode } from './shifts'
import type { TimeLog } from './types'

export type ClockInPayload = {
  client_id: string
  branch_id: string
  shift_code: ShiftCode
  clock_in: string
  is_straight_duty: boolean
  gps_in_lat: number | null
  gps_in_lng: number | null
  gps_in_warning: string | null
  selfie_missing: boolean
}

export type ClockOutPayload = {
  client_id: string
  clock_out: string
  gps_out_lat: number | null
  gps_out_lng: number | null
  gps_out_warning: string | null
}

export type InventoryLineInput = {
  item_id: string
  quantity: number
  received: number
  variance_note: string
}

export type InventoryPayload = {
  client_id: string
  branch_id: string
  area: string
  shift_code: 'am' | 'pm' | 'graveyard'
  work_date: string
  phase: 'start' | 'end'
  lines: InventoryLineInput[]
}

export type SelfiePayload = {
  client_id: string
  which: 'in' | 'out'
}

export type QueueItem = {
  id: string
  kind: 'clock_in' | 'clock_out' | 'inventory' | 'selfie'
  createdAt: number
  payload: ClockInPayload | ClockOutPayload | InventoryPayload | SelfiePayload
  selfie?: Blob
}

export type LocalShift = {
  clientId: string
  branchId: string
  shift: ShiftCode
  workDate: string
  clockIn: string
  straightDuty: boolean
  source: 'server' | 'phone'
  gpsWarning: string | null
  hasSelfie: boolean
}

export function localShiftFromLog(log: TimeLog): LocalShift {
  return {
    clientId: log.client_id,
    branchId: log.branch_id,
    shift: log.shift_code,
    workDate: log.work_date,
    clockIn: log.clock_in,
    straightDuty: log.is_straight_duty,
    source: 'server',
    gpsWarning: log.gps_in_warning,
    hasSelfie: Boolean(log.selfie_in_path),
  }
}

export function overlayQueue(server: TimeLog | null, queue: QueueItem[]): LocalShift | null {
  let current: LocalShift | null =
    server && !server.clock_out && !server.missed_clock_out ? localShiftFromLog(server) : null
  const ordered = [...queue].sort((a, b) => a.createdAt - b.createdAt)
  for (const item of ordered) {
    if (item.kind === 'clock_in') {
      const payload = item.payload as ClockInPayload
      current = {
        clientId: payload.client_id,
        branchId: payload.branch_id,
        shift: payload.shift_code,
        workDate: workDateFor(payload.shift_code, new Date(payload.clock_in)),
        clockIn: payload.clock_in,
        straightDuty: payload.is_straight_duty,
        source: 'phone',
        gpsWarning: payload.gps_in_warning,
        hasSelfie: Boolean(item.selfie) || !payload.selfie_missing,
      }
    } else if (item.kind === 'clock_out') {
      const payload = item.payload as ClockOutPayload
      if (!current || current.clientId === payload.client_id) current = null
    }
  }
  return current
}

export function queuedCount(queue: QueueItem[], slot: {
  branch_id: string
  area: string
  shift_code: string
  work_date: string
  phase: string
}): InventoryPayload | null {
  const hit = [...queue].reverse().find((item) => {
    if (item.kind !== 'inventory') return false
    const payload = item.payload as InventoryPayload
    return (
      payload.branch_id === slot.branch_id &&
      payload.area === slot.area &&
      payload.shift_code === slot.shift_code &&
      payload.work_date === slot.work_date &&
      payload.phase === slot.phase
    )
  })
  return hit ? (hit.payload as InventoryPayload) : null
}
