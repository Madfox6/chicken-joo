import { caller, corsHeaders, isResponse, json } from '../_shared/http.ts'

type Body = {
  employee_code?: string
  full_name?: string
  role?: string
  branch_id?: string | null
  daily_allowance?: number
  supervisor_addon?: number
  pin?: string
}

const ROLES = ['staff', 'supervisor', 'sub_owner', 'owner']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  try {
    const who = await caller(req)
    if (isResponse(who)) return who
    if (!['owner', 'sub_owner', 'supervisor'].includes(who.profile.role)) {
      return json({ error: 'You cannot add employees' }, 403)
    }
    const body = (await req.json()) as Body
    const code = (body.employee_code ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const pin = (body.pin ?? '').trim()
    const role = body.role ?? 'staff'
    const name = (body.full_name ?? '').trim()
    const branchId = body.branch_id || null
    const allowance = Number(body.daily_allowance ?? 50)
    const addon = Math.min(100, Math.max(0, Number(body.supervisor_addon ?? 0)))
    if (!/^[A-Z0-9]{3,12}$/.test(code)) return json({ error: 'Code should be 3–12 letters or numbers' }, 400)
    if (!/^\d{4}$/.test(pin)) return json({ error: 'PIN must be 4 digits' }, 400)
    if (!ROLES.includes(role)) return json({ error: 'Unknown role' }, 400)
    if (name.length < 2) return json({ error: 'Enter the employee name' }, 400)
    if ((role === 'staff' || role === 'supervisor') && !branchId) {
      return json({ error: 'Pick a branch' }, 400)
    }
    if (who.profile.role === 'supervisor') {
      if (role !== 'staff') return json({ error: 'Supervisors can add staff only' }, 400)
      if (branchId !== who.profile.branch_id) return json({ error: 'That branch is not yours' }, 400)
    }
    if (who.profile.role === 'sub_owner' && role === 'owner') {
      return json({ error: 'Only an owner can add an owner' }, 400)
    }
    if (!Number.isFinite(allowance) || allowance < 0) return json({ error: 'Allowance looks wrong' }, 400)

    const { data: existing } = await who.admin
      .from('profiles')
      .select('id')
      .eq('employee_code', code)
      .maybeSingle()
    if (existing) return json({ error: 'That code is already used' }, 400)

    const email = `${code.toLowerCase()}@staff.chickenjoo.local`
    const { data, error } = await who.admin.auth.admin.createUser({
      email,
      password: `CJ${pin}`,
      email_confirm: true,
      app_metadata: {
        role,
        full_name: name,
        branch_id: branchId,
        daily_allowance: allowance,
        supervisor_addon: role === 'supervisor' ? addon : 0,
      },
    })
    if (error || !data.user) return json({ error: error?.message ?? 'Could not create the login' }, 400)

    const { error: profileError } = await who.admin.from('profiles').upsert({
      id: data.user.id,
      employee_code: code,
      full_name: name,
      role,
      branch_id: branchId,
      daily_allowance: allowance,
      supervisor_addon: role === 'supervisor' ? addon : 0,
      active: true,
    })
    if (profileError) return json({ error: profileError.message }, 400)
    return json({ id: data.user.id, employee_code: code })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not add the employee'
    return json({ error: message }, 400)
  }
})
