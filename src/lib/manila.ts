export type ManilaParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: string
  iso: string
}

export function manilaParts(date: Date): ManilaParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const bag: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: bag.weekday,
    iso: `${bag.year}-${bag.month}-${bag.day}`,
  }
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Manila wall-clock time as an absolute instant. `hhmm` is `HH:mm`. */
export function atManila(isoDate: string, hhmm: string): Date {
  return new Date(`${isoDate}T${hhmm}:00+08:00`)
}

export function manilaToday(now = new Date()): string {
  return manilaParts(now).iso
}

/** Sunday–Saturday week that contains `anchor`, in Asia/Manila. */
export function manilaWeek(anchor: Date): { start: string; end: string } {
  const parts = manilaParts(anchor)
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  const start = addDays(parts.iso, -index)
  return { start, end: addDays(start, 6) }
}

export function shiftManilaWeek(start: string, direction: -1 | 1): { start: string; end: string } {
  const next = addDays(start, direction * 7)
  return { start: next, end: addDays(next, 6) }
}

export function formatManilaDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatManilaTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatWeek(start: string, end: string): string {
  return `${formatManilaDate(start)} – ${formatManilaDate(end)}`
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4))
}
