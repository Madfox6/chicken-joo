import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Empty } from '../components/ui'
import { getLogs, getPeople } from '../lib/data'
import { messageOf } from '../lib/errors'
import { formatManilaDate, formatManilaTime } from '../lib/manila'
import { peso } from '../lib/money'
import { minuteDeduction } from '../lib/pay'
import { seesAll } from '../lib/roles'
import { AREA_LABEL, SHIFTS } from '../lib/shifts'
import { supabase } from '../lib/supabase'
import type { Profile, TimeLog } from '../lib/types'

type VarianceRow = {
  id: string
  delta: number
  note: string | null
  name: string
  area: string
  shift: string
  workDate: string
  branchId: string
}

export function ApprovalsScreen() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [variances, setVariances] = useState<VarianceRow[]>([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function load() {
    if (!profile) return
    setError('')
    try {
      const branchId = seesAll(profile.role) ? undefined : profile.branch_id ?? undefined
      const [pending, roster] = await Promise.all([
        getLogs({ status: 'pending', branchId }),
        getPeople(),
      ])
      setLogs(pending)
      setPeople(roster)
      const { data, error: lineError } = await supabase
        .from('inventory_lines')
        .select('id, variance_delta, variance_note, inventory_items(name), inventory_counts(branch_id, area, shift_code, work_date)')
        .eq('variance_ack', false)
        .not('variance_delta', 'is', null)
      if (lineError) throw lineError
      const rows = (data ?? []).map((row) => {
        const record = row as Record<string, unknown>
        const count = record.inventory_counts as Record<string, unknown> | null
        const item = record.inventory_items as { name?: string } | null
        return {
          id: String(record.id),
          delta: Number(record.variance_delta),
          note: record.variance_note ? String(record.variance_note) : null,
          name: item?.name ?? 'Item',
          area: String(count?.area ?? ''),
          shift: String(count?.shift_code ?? ''),
          workDate: String(count?.work_date ?? '').slice(0, 10),
          branchId: String(count?.branch_id ?? ''),
        }
      }).filter((row) => row.delta !== 0 && (!branchId || row.branchId === branchId))
      setVariances(rows)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function act(log: TimeLog, action: 'approve' | 'reject' | 'waive') {
    setInfo('')
    const patch =
      action === 'approve'
        ? { issues_reviewed: true, ot_approved: log.ot_minutes > 0, straight_duty_approved: log.is_straight_duty }
        : action === 'reject'
          ? { issues_reviewed: true, ot_rejected: true, straight_duty_rejected: true }
          : { late_waived: true, undertime_waived: true }
    const { error: updateError } = await supabase.from('time_logs').update(patch).eq('id', log.id)
    if (updateError) setError(updateError.message)
    else {
      setInfo('Saved.')
      await load()
    }
  }

  async function ack(id: string) {
    const { error: updateError } = await supabase.from('inventory_lines').update({ variance_ack: true }).eq('id', id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  const nameOf = (id: string) => people.find((person) => person.id === id)?.full_name ?? 'Employee'

  return (
    <div className="stack">
      <div className="spread">
        <h1>Approvals</h1>
        <Button variant="ghost" onClick={() => void load()}>Refresh</Button>
      </div>
      <p className="muted">Clean shifts approve themselves. This list is only the problems.</p>
      {error && <Banner tone="bad">{error}</Banner>}
      {info && <Banner tone="ok">{info}</Banner>}
      {logs.length === 0 && variances.length === 0 && <Empty>Nothing waiting.</Empty>}
      {logs.map((log) => (
        <article key={log.id} className="card stack">
          <strong>{nameOf(log.employee_id)}</strong>
          <p className="muted">{formatManilaDate(log.work_date)} · {SHIFTS[log.shift_code].label} · {formatManilaTime(log.clock_in)}–{log.clock_out ? formatManilaTime(log.clock_out) : '—'}</p>
          {log.late_minutes > 15 && !log.late_waived && <p>Late {log.late_minutes} min · deduction {peso(minuteDeduction(log.late_minutes))}</p>}
          {log.undertime_minutes > 15 && !log.undertime_waived && <p>Undertime {log.undertime_minutes} min · deduction {peso(minuteDeduction(log.undertime_minutes))}</p>}
          {log.ot_minutes > 0 && !log.ot_approved && !log.ot_rejected && <p>Overtime {log.ot_minutes} min is not paid until you approve it.</p>}
          {log.is_straight_duty && !log.straight_duty_approved && !log.straight_duty_rejected && <p>Straight duty. The second shift is unpaid until you approve it.</p>}
          {log.ot_minutes > 0 || log.is_straight_duty ? (
            <>
              <Button block onClick={() => void act(log, 'approve')}>Approve extra pay</Button>
              <Button block variant="ghost" onClick={() => void act(log, 'reject')}>Reject extra pay</Button>
            </>
          ) : (
            <Button block onClick={() => void act(log, 'approve')}>Confirm deduction</Button>
          )}
          {(log.late_minutes > 15 || log.undertime_minutes > 15) && (
            <Button block variant="dark" onClick={() => void act(log, 'waive')}>Waive late / undertime</Button>
          )}
        </article>
      ))}
      {variances.map((row) => (
        <article key={row.id} className="card stack">
          <strong>{row.name}</strong>
          <p className="muted">{row.workDate} · {row.shift} · {AREA_LABEL[row.area] ?? row.area}</p>
          <p>Start differs from the last end by {row.delta > 0 ? '+' : ''}{row.delta}.</p>
          {row.note && <p>Note: {row.note}</p>}
          <Button block variant="dark" onClick={() => void ack(row.id)}>Acknowledge</Button>
        </article>
      ))}
    </div>
  )
}
