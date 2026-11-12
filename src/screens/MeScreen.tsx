import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { PayBreakdown } from '../components/PayBreakdown'
import { Banner, Button, Empty } from '../components/ui'
import { getHolidays, getLogs } from '../lib/data'
import { messageOf } from '../lib/errors'
import { formatManilaDate, formatManilaTime, formatWeek, manilaWeek, shiftManilaWeek, yearOf } from '../lib/manila'
import { peso } from '../lib/money'
import { computeWeekPay, minuteDeduction, thirteenthMonthAccrual } from '../lib/pay'
import { daysFromLogs } from '../lib/payroll'
import { SHIFTS } from '../lib/shifts'
import type { Holiday, TimeLog } from '../lib/types'

export function MeScreen() {
  const { profile, signOut } = useAuth()
  const [week, setWeek] = useState(() => manilaWeek(new Date()))
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    const yearStart = `${yearOf(week.start)}-01-01`
    Promise.all([
      getLogs({ employeeId: profile.id, from: yearStart, to: week.end }),
      getHolidays(),
    ])
      .then(([rows, days]) => {
        setLogs(rows)
        setHolidays(days)
      })
      .catch((err) => setError(messageOf(err)))
  }, [profile, week.start, week.end])

  if (!profile) return null
  const weekLogs = logs.filter((log) => log.work_date >= week.start && log.work_date <= week.end)
  const pay = computeWeekPay(daysFromLogs(weekLogs, profile, holidays))
  const ytdBase = daysFromLogs(logs, profile, holidays).reduce((sum, day) => sum + day.base, 0)

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <p className="kicker">{profile.employee_code}</p>
          <h1>My pay</h1>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
      </div>
      <div className="spread">
        <Button variant="ghost" onClick={() => setWeek((current) => shiftManilaWeek(current.start, -1))}>Prev</Button>
        <strong>{formatWeek(week.start, week.end)}</strong>
        <Button variant="ghost" onClick={() => setWeek((current) => shiftManilaWeek(current.start, 1))}>Next</Button>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <section className="card">
        <PayBreakdown pay={pay} accrual={thirteenthMonthAccrual(ytdBase)} leave={profile.leave_balance} />
      </section>
      <h2>Timesheet</h2>
      {weekLogs.length === 0 && <Empty>No shifts this week.</Empty>}
      {weekLogs.map((log) => (
        <article key={log.id} className="card stack">
          <div className="spread">
            <strong>{formatManilaDate(log.work_date)} · {SHIFTS[log.shift_code].label}</strong>
            <span className="badge">{log.status.replace('_', ' ')}</span>
          </div>
          <p className="muted">
            {formatManilaTime(log.clock_in)} – {log.clock_out ? formatManilaTime(log.clock_out) : log.missed_clock_out ? 'Missed clock-out' : 'Still in'}
          </p>
          {log.late_minutes > 15 && !log.late_waived && <p>Late deduction {peso(minuteDeduction(log.late_minutes))}</p>}
          {log.is_straight_duty && !log.straight_duty_approved && <p className="muted">Straight duty not approved yet.</p>}
        </article>
      ))}
    </div>
  )
}
