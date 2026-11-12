import { peso } from '../lib/money'
import type { WeekPay } from '../lib/pay'
import { SHIFTS } from '../lib/shifts'
import { formatManilaDate } from '../lib/manila'

export function PayBreakdown({
  pay,
  accrual,
  leave,
}: {
  pay: WeekPay
  accrual?: number
  leave?: number
}) {
  return (
    <div className="stack">
      {pay.days.map((day) => (
        <div key={day.workDate} className="kv">
          <span>
            {formatManilaDate(day.workDate)}
            {day.shifts.map((shift) => ` · ${SHIFTS[shift.shift].label}${shift.paidUnits === 2 ? ' ×2' : ''}`).join('')}
          </span>
          <strong>{peso(day.net)}</strong>
        </div>
      ))}
      <div className="kv"><span>Base</span><strong>{peso(pay.base)}</strong></div>
      <div className="kv"><span>Allowance</span><strong>{peso(pay.allowance)}</strong></div>
      {pay.supervisorAddon > 0 && <div className="kv"><span>Supervisor add-on</span><strong>{peso(pay.supervisorAddon)}</strong></div>}
      <div className="kv"><span>Night differential</span><strong>{peso(pay.nightDiff)}</strong></div>
      <div className="kv"><span>Overtime</span><strong>{peso(pay.otPay)}</strong></div>
      <div className="kv"><span>Late</span><strong>−{peso(pay.lateDeduction)}</strong></div>
      <div className="kv"><span>Undertime</span><strong>−{peso(pay.undertimeDeduction)}</strong></div>
      {pay.cashAdvance > 0 && <div className="kv"><span>Cash advance</span><strong>−{peso(pay.cashAdvance)}</strong></div>}
      {pay.sss > 0 && <div className="kv"><span>SSS</span><strong>−{peso(pay.sss)}</strong></div>}
      {pay.philhealth > 0 && <div className="kv"><span>PhilHealth</span><strong>−{peso(pay.philhealth)}</strong></div>}
      {pay.pagibig > 0 && <div className="kv"><span>Pag-IBIG</span><strong>−{peso(pay.pagibig)}</strong></div>}
      <div className="kv total"><span>Net</span><strong>{peso(pay.net)}</strong></div>
      {accrual != null && <div className="kv"><span>13th month accrual</span><strong>{peso(accrual)}</strong></div>}
      {leave != null && <div className="kv"><span>Leave balance</span><strong>{leave} days</strong></div>}
      {pay.days.some((day) => day.shifts.some((shift) => shift.straightDutyPending)) && (
        <p className="muted">Straight duty is waiting for approval, so the second shift is not in this pay.</p>
      )}
    </div>
  )
}
