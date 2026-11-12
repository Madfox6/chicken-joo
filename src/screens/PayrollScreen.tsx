import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { PayBreakdown } from '../components/PayBreakdown'
import { Banner, Button, Field } from '../components/ui'
import { getAdjustments, getHolidays, getLogs, getPeople } from '../lib/data'
import { downloadCsv, toCsv } from '../lib/csv'
import { messageOf } from '../lib/errors'
import { formatWeek, manilaWeek, shiftManilaWeek, yearOf } from '../lib/manila'
import { peso } from '../lib/money'
import { computeWeekPay, emptyAdjustments, thirteenthMonthAccrual, type Adjustments } from '../lib/pay'
import { daysFromLogs } from '../lib/payroll'
import { seesAll } from '../lib/roles'
import { supabase } from '../lib/supabase'
import type { Holiday, Profile, TimeLog } from '../lib/types'

export function PayrollScreen() {
  const { profile } = useAuth()
  const [week, setWeek] = useState(() => manilaWeek(new Date()))
  const [people, setPeople] = useState<Profile[]>([])
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [adjustments, setAdjustments] = useState<Record<string, Adjustments & { notes: string }>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function load(start = week.start, end = week.end) {
    if (!profile) return
    const yearStart = `${yearOf(start)}-01-01`
    const [roster, rows, days, saved] = await Promise.all([
      getPeople(),
      getLogs({ from: yearStart, to: end, branchId: seesAll(profile.role) ? undefined : profile.branch_id ?? undefined }),
      getHolidays(),
      getAdjustments(start),
    ])
    setPeople(roster.filter((person) => person.active))
    setLogs(rows)
    setHolidays(days)
    const map: Record<string, Adjustments & { notes: string }> = {}
    for (const row of saved) {
      map[row.employee_id] = {
        cashAdvance: row.cash_advance,
        sss: row.sss,
        philhealth: row.philhealth,
        pagibig: row.pagibig,
        notes: row.notes ?? '',
      }
    }
    setAdjustments(map)
  }

  useEffect(() => {
    load().catch((err) => setError(messageOf(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, week.start])

  function adjustmentFor(id: string): Adjustments & { notes: string } {
    return adjustments[id] ?? { ...emptyAdjustments(), notes: '' }
  }

  function payFor(person: Profile) {
    const mine = logs.filter((log) => log.employee_id === person.id)
    const weekLogs = mine.filter((log) => log.work_date >= week.start && log.work_date <= week.end)
    const pay = computeWeekPay(daysFromLogs(weekLogs, person, holidays), adjustmentFor(person.id))
    const ytd = daysFromLogs(mine, person, holidays).reduce((sum, day) => sum + day.base, 0)
    return { pay, accrual: thirteenthMonthAccrual(ytd) }
  }

  async function saveAdjustment(person: Profile) {
    const row = adjustmentFor(person.id)
    const { error: upsertError } = await supabase.from('payroll_adjustments').upsert({
      employee_id: person.id,
      week_start: week.start,
      cash_advance: row.cashAdvance,
      sss: row.sss,
      philhealth: row.philhealth,
      pagibig: row.pagibig,
      notes: row.notes || null,
    }, { onConflict: 'employee_id,week_start' })
    if (upsertError) setError(upsertError.message)
    else setInfo(`Saved deductions for ${person.full_name}.`)
  }

  function exportCsv() {
    const rows = people.map((person) => {
      const { pay, accrual } = payFor(person)
      return [
        person.full_name,
        person.employee_code,
        person.role,
        pay.base,
        pay.allowance,
        pay.supervisorAddon,
        pay.nightDiff,
        pay.otPay,
        pay.lateDeduction,
        pay.undertimeDeduction,
        pay.cashAdvance,
        pay.sss,
        pay.philhealth,
        pay.pagibig,
        pay.gross,
        pay.deductions,
        pay.net,
        accrual,
        person.leave_balance,
      ]
    })
    downloadCsv(
      `chicken-joo-${week.start}.csv`,
      toCsv(
        ['Employee', 'Code', 'Role', 'Base', 'Allowance', 'Supervisor', 'Night diff', 'OT', 'Late', 'Undertime', 'Cash advance', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Gross', 'Deductions', 'Net', '13th month accrual', 'Leave days'],
        rows,
      ),
    )
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1>Payroll</h1>
        <Button variant="ghost" onClick={exportCsv}>CSV</Button>
      </div>
      <div className="spread">
        <Button variant="ghost" onClick={() => setWeek((current) => shiftManilaWeek(current.start, -1))}>Prev</Button>
        <strong>{formatWeek(week.start, week.end)}</strong>
        <Button variant="ghost" onClick={() => setWeek((current) => shiftManilaWeek(current.start, 1))}>Next</Button>
      </div>
      <p className="muted">Week runs Sunday to Saturday. 13th month accrual is base pay since 1 January, divided by 12.</p>
      {error && <Banner tone="bad">{error}</Banner>}
      {info && <Banner tone="ok">{info}</Banner>}
      {people.map((person) => {
        const { pay, accrual } = payFor(person)
        const row = adjustmentFor(person.id)
        const open = openId === person.id
        return (
          <article key={person.id} className="card stack">
            <button type="button" className="spread plain" onClick={() => setOpenId(open ? null : person.id)}>
              <strong>{person.full_name}</strong>
              <span>{peso(pay.net)}</span>
            </button>
            {open && (
              <>
                <PayBreakdown pay={pay} accrual={accrual} leave={person.leave_balance} />
                <Field label="Cash advance"><input inputMode="decimal" value={String(row.cashAdvance)} onChange={(event) => setAdjustments((current) => ({ ...current, [person.id]: { ...row, cashAdvance: Number(event.target.value) } }))} /></Field>
                <Field label="SSS"><input inputMode="decimal" value={String(row.sss)} onChange={(event) => setAdjustments((current) => ({ ...current, [person.id]: { ...row, sss: Number(event.target.value) } }))} /></Field>
                <Field label="PhilHealth"><input inputMode="decimal" value={String(row.philhealth)} onChange={(event) => setAdjustments((current) => ({ ...current, [person.id]: { ...row, philhealth: Number(event.target.value) } }))} /></Field>
                <Field label="Pag-IBIG"><input inputMode="decimal" value={String(row.pagibig)} onChange={(event) => setAdjustments((current) => ({ ...current, [person.id]: { ...row, pagibig: Number(event.target.value) } }))} /></Field>
                <Button block variant="dark" onClick={() => void saveAdjustment(person)}>Save deductions</Button>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}
