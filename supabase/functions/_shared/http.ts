import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export type Caller = {
  admin: SupabaseClient
  profile: {
    id: string
    role: string
    branch_id: string | null
    active: boolean
  }
}

export async function caller(req: Request): Promise<Caller | Response> {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) return json({ error: 'Service role is not configured' }, 500)
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sign in first' }, 401)
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return json({ error: 'Sign in first' }, 401)
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, branch_id, active')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError || !profile) return json({ error: 'No staff profile for this login' }, 403)
  if (!profile.active) return json({ error: 'This account is inactive' }, 403)
  return { admin, profile }
}

export function isResponse(value: Caller | Response): value is Response {
  return value instanceof Response
}
