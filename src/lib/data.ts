import { recall, remember } from './cache'
import { supabase } from './supabase'
import {
  asAdjustment,
  asArea,
  asBranch,
  asHoliday,
  asItem,
  asProfile,
  asTimeLog,
  type Adjustment,
  type Branch,
  type BranchArea,
  type Holiday,
  type Item,
  type Profile,
  type TimeLog,
} from './types'

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load()
    remember(key, value)
    return value
  } catch (error) {
    const saved = recall<T>(key)
    if (saved !== undefined) return saved
    throw error
  }
}

export async function getBranches(): Promise<Branch[]> {
  return cached('branches', async () => {
    const { data, error } = await supabase.from('branches').select('*').eq('active', true).order('name')
    if (error) throw error
    return (data ?? []).map((row) => asBranch(row as Record<string, unknown>))
  })
}

export async function getProfile(id: string): Promise<Profile | null> {
  return cached(`profile:${id}`, async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? asProfile(data as Record<string, unknown>) : null
  })
}

export async function getOpenLog(employeeId: string): Promise<TimeLog | null> {
  return cached(`open:${employeeId}`, async () => {
    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .eq('employee_id', employeeId)
      .is('clock_out', null)
      .eq('missed_clock_out', false)
      .maybeSingle()
    if (error) throw error
    return data ? asTimeLog(data as Record<string, unknown>) : null
  })
}

export async function getItems(): Promise<Item[]> {
  return cached('items', async () => {
    const { data, error } = await supabase.from('inventory_items').select('*').order('sort_order')
    if (error) throw error
    return (data ?? []).map((row) => asItem(row as Record<string, unknown>))
  })
}

export async function getAreas(): Promise<BranchArea[]> {
  return cached('areas', async () => {
    const { data, error } = await supabase.from('branch_areas').select('*')
    if (error) throw error
    return (data ?? []).map((row) => asArea(row as Record<string, unknown>))
  })
}

export async function getHolidays(): Promise<Holiday[]> {
  return cached('holidays', async () => {
    const { data, error } = await supabase.from('holidays').select('*').order('holiday_date')
    if (error) throw error
    return (data ?? []).map((row) => asHoliday(row as Record<string, unknown>))
  })
}

export async function getPeople(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  const people = (data ?? []).map((row) => asProfile(row as Record<string, unknown>))
  remember('people', people)
  return people
}

export async function getPeopleCached(): Promise<Profile[]> {
  try {
    return await getPeople()
  } catch (error) {
    const saved = recall<Profile[]>('people')
    if (saved) return saved
    throw error
  }
}

export async function getLogs(filters: {
  employeeId?: string
  branchId?: string
  from?: string
  to?: string
  status?: string
  workDate?: string
}): Promise<TimeLog[]> {
  const pageSize = 1000
  const rows: TimeLog[] = []
  for (let offset = 0; offset < 20000; offset += pageSize) {
    let query = supabase.from('time_logs').select('*').order('clock_in', { ascending: false })
    if (filters.employeeId) query = query.eq('employee_id', filters.employeeId)
    if (filters.branchId) query = query.eq('branch_id', filters.branchId)
    if (filters.from) query = query.gte('work_date', filters.from)
    if (filters.to) query = query.lte('work_date', filters.to)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.workDate) query = query.eq('work_date', filters.workDate)
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    const batch = (data ?? []).map((row) => asTimeLog(row as Record<string, unknown>))
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

export async function getAdjustments(weekStart: string): Promise<Adjustment[]> {
  const { data, error } = await supabase.from('payroll_adjustments').select('*').eq('week_start', weekStart)
  if (error) throw error
  return (data ?? []).map((row) => asAdjustment(row as Record<string, unknown>))
}

export async function callFunction<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let detail = error.message
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const payload = (await context.json()) as { error?: string }
        if (payload?.error) detail = payload.error
      } catch {
        detail = error.message
      }
    }
    throw new Error(detail)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
  return data as T
}
