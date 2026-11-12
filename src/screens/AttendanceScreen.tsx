import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Selfie } from '../components/Selfie'
import { Banner, Button, Empty } from '../components/ui'
import { getBranches, getLogs, getPeople } from '../lib/data'
import { messageOf } from '../lib/errors'
import { formatManilaTime, manilaToday } from '../lib/manila'
import { seesAll } from '../lib/roles'
import { SHIFTS } from '../lib/shifts'
import { supabase } from '../lib/supabase'
import type { Branch, Profile, TimeLog } from '../lib/types'

export function AttendanceScreen() {
  const { profile } = useAuth()
  const [date, setDate] = useState(manilaToday())
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [error, setError] = useState('')

  async function load(nextDate = date, nextBranch = branchId) {
    if (!profile) return
    try {
      const scoped = seesAll(profile.role) ? nextBranch || undefined : profile.branch_id ?? undefined
      const [rows, roster, branchRows] = await Promise.all([
        getLogs({ workDate: nextDate, branchId: scoped }),
        getPeople(),
        getBranches(),
      ])
      setLogs(rows)
      setPeople(roster)
      setBranches(branchRows)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  useEffect(() => {
    if (!profile) return
    setBranchId(profile.branch_id ?? '')
    void load(manilaToday(), seesAll(profile.role) ? '' : profile.branch_id ?? '')
    // Initial load for the signed-in manager.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function toggleRest(log: TimeLog) {
    const { error: updateError } = await supabase.from('time_logs').update({ is_rest_day: !log.is_rest_day }).eq('id', log.id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  const nameOf = (id: string) => people.find((person) => person.id === id)?.full_name ?? 'Employee'

  return (
    <div className="stack">
      <h1>Attendance</h1>
      <label className="field">
        <span>Date</span>
        <input type="date" value={date} onChange={(event) => { setDate(event.target.value); void load(event.target.value, branchId) }} />
      </label>
      {profile && seesAll(profile.role) && (
        <div className="chips">
          <button type="button" className={`chip${branchId === '' ? ' on' : ''}`} onClick={() => { setBranchId(''); void load(date, '') }}>All</button>
          {branches.map((branch) => (
            <button key={branch.id} type="button" className={`chip${branchId === branch.id ? ' on' : ''}`} onClick={() => { setBranchId(branch.id); void load(date, branch.id) }}>
              {branch.name}
            </button>
          ))}
        </div>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      {logs.length === 0 && <Empty>No attendance for this day.</Empty>}
      {logs.map((log) => (
        <article key={log.id} className="card stack">
          <div className="spread">
            <strong>{nameOf(log.employee_id)}</strong>
            <span className="badge">{SHIFTS[log.shift_code].label}</span>
          </div>
          <p className="muted">{formatManilaTime(log.clock_in)} – {log.clock_out ? formatManilaTime(log.clock_out) : log.missed_clock_out ? 'Missed clock-out' : 'Still in'}</p>
          <Selfie path={log.selfie_in_path} alt={`${nameOf(log.employee_id)} clock-in selfie`} />
          {log.gps_in_warning && <p className="muted">{log.gps_in_warning}</p>}
          {log.late_minutes > 0 && <p className="muted">{log.late_minutes} min late{log.late_waived ? ' · waived' : ''}</p>}
          <Button variant={log.is_rest_day ? 'dark' : 'ghost'} onClick={() => void toggleRest(log)}>
            {log.is_rest_day ? 'Rest day pay is on' : 'Mark rest day'}
          </Button>
        </article>
      ))}
    </div>
  )
}
