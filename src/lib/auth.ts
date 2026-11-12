/**
 * Supabase passwords must be at least 6 characters.
 * A 4-digit PIN is stored as the password `CJ` + PIN.
 * PIN 1234 → password CJ1234. The employee code is the email local-part.
 */
export const PIN_PREFIX = 'CJ'
export const STAFF_EMAIL_DOMAIN = 'staff.chickenjoo.local'

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export function staffEmail(code: string): string {
  return `${normalizeCode(code).toLowerCase()}@${STAFF_EMAIL_DOMAIN}`
}

export function pinToPassword(pin: string): string {
  return `${PIN_PREFIX}${pin.trim()}`
}

export function isPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim())
}

export function isEmployeeCode(code: string): boolean {
  return /^[A-Z0-9]{3,12}$/.test(normalizeCode(code))
}
