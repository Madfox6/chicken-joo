import type { Role } from './types'

export function seesAll(role: Role): boolean {
  return role === 'owner' || role === 'sub_owner'
}

export function isManager(role: Role): boolean {
  return role === 'supervisor' || seesAll(role)
}

export function canPayroll(role: Role): boolean {
  return seesAll(role)
}

export function canEditItems(role: Role): boolean {
  return role === 'owner'
}

export const ROLE_LABEL: Record<Role, string> = {
  staff: 'Staff',
  supervisor: 'Supervisor',
  sub_owner: 'Sub-owner',
  owner: 'Owner',
}
