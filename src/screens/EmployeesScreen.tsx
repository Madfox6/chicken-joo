import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Empty, Field } from '../components/ui'
import { callFunction, getBranches, getPeople } from '../lib/data'
import { supabase } from '../lib/supabase'
import { messageOf } from '../lib/errors'
import { peso } from '../lib/money'
import { ROLE_LABEL, seesAll } from '../lib/roles'
import type { Branch, Profile, Role } from '../lib/types'

const ROLES: Role[] = ['staff', 'supervisor', 'sub_owner', 'owner']

export function EmployeesScreen() {
  const { profile } = useAuth()
  const [people, setPeople] = useState<Profile[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [pin, setPin] = useState('')
  const [form, setForm] = useState({
    employee_code: '',
    full_name: '',
    role: 'staff' as Role,
    branch_id: '',
    daily_allowance: '50',
    supervisor_addon: '0',
    pin: '',
  })

  async function load() {
    const [roster, branchRows] = await Promise.all([getPeople(), getBranches()])
    setPeople(roster)
    setBranches(branchRows)
  }

  useEffect(() => {
    load().catch((err) => setError(messageOf(err)))
  }, [])

  useEffect(() => {
    if (profile?.branch_id) {
      setForm((current) => ({ ...current, branch_id: current.branch_id || profile.branch_id || '' }))
    }
  }, [profile])

  if (!profile) return null
  const ownerLike = seesAll(profile.role)
  const branchName = (id: string | null) => branches.find((branch) => branch.id === id)?.name ?? 'All branches'

  async function createEmployee() {
    setError('')
    setInfo('')
    try {
      await callFunction('create-employee', {
        ...form,
        branch_id: form.branch_id || null,
        daily_allowance: Number(form.daily_allowance),
        supervisor_addon: Number(form.supervisor_addon),
      })
      setInfo(`${form.full_name} can sign in with code ${form.employee_code.toUpperCase()}.`)
      setAdding(false)
      await load()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function save(person: Profile) {
    setError('')
    const { error: updateError } = await supabaseUpdate(person)
    if (updateError) setError(updateError)
    else {
      setInfo('Saved.')
      setSelected(null)
      await load()
    }
  }

  async function resetPin(person: Profile) {
    setError('')
    try {
      await callFunction('reset-pin', { employee_id: person.id, pin })
      setInfo(`PIN updated for ${person.full_name}.`)
      setPin('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1>Employees</h1>
        <Button onClick={() => setAdding((value) => !value)}>{adding ? 'Close' : 'Add'}</Button>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      {info && <Banner tone="ok">{info}</Banner>}
      {adding && (
        <section className="card stack">
          <Field label="Code"><input value={form.employee_code} onChange={(event) => setForm({ ...form, employee_code: event.target.value.toUpperCase() })} /></Field>
          <Field label="Name"><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
          {ownerLike && (
            <Field label="Role">
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                {ROLES.filter((role) => profile.role === 'owner' || role !== 'owner').map((role) => (
                  <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Branch">
            <select value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })}>
              {ownerLike && <option value="">All branches</option>}
              {branches.filter((branch) => ownerLike || branch.id === profile.branch_id).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Daily allowance"><input inputMode="decimal" value={form.daily_allowance} onChange={(event) => setForm({ ...form, daily_allowance: event.target.value })} /></Field>
          <Field label="PIN"><input inputMode="numeric" maxLength={4} value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
          <Button block onClick={() => void createEmployee()}>Create login</Button>
        </section>
      )}
      {people.length === 0 && <Empty>No employees yet.</Empty>}
      {people.map((person) => (
        <article key={person.id} className="card stack">
          <button type="button" className="spread plain" onClick={() => { setSelected(selected?.id === person.id ? null : person); setPin('') }}>
            <span>
              <strong>{person.full_name}</strong>
              <span className="muted"> {person.employee_code} · {ROLE_LABEL[person.role]} · {branchName(person.branch_id)}</span>
            </span>
            <span>{peso(person.daily_allowance)}</span>
          </button>
          {selected?.id === person.id && (
            <Editor
              person={selected}
              branches={branches}
              ownerLike={ownerLike}
              canOwn={profile.role === 'owner'}
              pin={pin}
              setPin={setPin}
              onChange={setSelected}
              onSave={() => void save(selected)}
              onReset={() => void resetPin(selected)}
            />
          )}
        </article>
      ))}
    </div>
  )
}

async function supabaseUpdate(person: Profile): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update({
    full_name: person.full_name,
    role: person.role,
    branch_id: person.branch_id,
    daily_allowance: person.daily_allowance,
    supervisor_addon: person.supervisor_addon,
    leave_balance: person.leave_balance,
    active: person.active,
  }).eq('id', person.id)
  return { error: error?.message ?? null }
}

function Editor({
  person,
  branches,
  ownerLike,
  canOwn,
  pin,
  setPin,
  onChange,
  onSave,
  onReset,
}: {
  person: Profile
  branches: Branch[]
  ownerLike: boolean
  canOwn: boolean
  pin: string
  setPin: (value: string) => void
  onChange: (person: Profile) => void
  onSave: () => void
  onReset: () => void
}) {
  return (
    <div className="stack">
      <Field label="Name"><input value={person.full_name} onChange={(event) => onChange({ ...person, full_name: event.target.value })} /></Field>
      <Field label="Daily allowance">
        <input inputMode="decimal" value={String(person.daily_allowance)} onChange={(event) => onChange({ ...person, daily_allowance: Number(event.target.value) })} />
      </Field>
      {ownerLike && (
        <>
          <Field label="Role">
            <select value={person.role} onChange={(event) => onChange({ ...person, role: event.target.value as Role })}>
              {ROLES.filter((role) => canOwn || role !== 'owner').map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select value={person.branch_id ?? ''} onChange={(event) => onChange({ ...person, branch_id: event.target.value || null })}>
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </Field>
          <Field label="Supervisor add-on (max 100)">
            <input inputMode="decimal" value={String(person.supervisor_addon)} onChange={(event) => onChange({ ...person, supervisor_addon: Number(event.target.value) })} />
          </Field>
          <Field label="Leave balance (days)">
            <input inputMode="decimal" value={String(person.leave_balance)} onChange={(event) => onChange({ ...person, leave_balance: Number(event.target.value) })} />
          </Field>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={person.active} onChange={(event) => onChange({ ...person, active: event.target.checked })} />
        Active
      </label>
      <Button block onClick={onSave}>Save</Button>
      <Field label="New PIN">
        <input inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
      </Field>
      <Button block variant="dark" disabled={pin.length !== 4} onClick={onReset}>Reset PIN</Button>
    </div>
  )
}
