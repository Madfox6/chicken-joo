import { caller, corsHeaders, isResponse, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  try {
    const who = await caller(req)
    if (isResponse(who)) return who
    if (!['owner', 'sub_owner', 'supervisor'].includes(who.profile.role)) {
      return json({ error: 'You cannot reset a PIN' }, 403)
    }
    const body = await req.json()
    const employeeId = String(body.employee_id ?? '')
    const pin = String(body.pin ?? '').trim()
    if (!employeeId) return json({ error: 'Pick an employee' }, 400)
    if (!/^\d{4}$/.test(pin)) return json({ error: 'PIN must be 4 digits' }, 400)

    const { data: target, error } = await who.admin
      .from('profiles')
      .select('id, role, branch_id')
      .eq('id', employeeId)
      .maybeSingle()
    if (error || !target) return json({ error: 'Employee not found' }, 404)
    if (who.profile.role === 'supervisor') {
      if (target.role !== 'staff' || target.branch_id !== who.profile.branch_id) {
        return json({ error: 'You can reset PINs for staff at your branch' }, 403)
      }
    }
    if (who.profile.role === 'sub_owner' && target.role === 'owner') {
      return json({ error: 'Only an owner can reset an owner PIN' }, 403)
    }
    const { error: updateError } = await who.admin.auth.admin.updateUserById(employeeId, {
      password: `CJ${pin}`,
    })
    if (updateError) return json({ error: updateError.message }, 400)
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reset the PIN'
    return json({ error: message }, 400)
  }
})
