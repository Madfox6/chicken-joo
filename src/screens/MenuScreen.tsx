import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Button } from '../components/ui'
import { canPayroll, seesAll } from '../lib/roles'

export function MenuScreen() {
  const { profile, signOut } = useAuth()
  if (!profile) return null
  const links = [
    ['/approvals', 'Approvals', 'Lates, overtime, straight duty, variances'],
    ['/review', 'Missed clock-outs', 'Put a time on a forgotten clock-out'],
    ['/attendance', 'Attendance', 'Times and selfies'],
    ['/stock', 'Stock notes', 'Usage and variance notes'],
    ['/employees', 'Employees', 'Allowance, role, branch, PIN'],
    ['/me', 'My pay', 'Your own timesheet and payslip'],
  ]
  if (seesAll(profile.role)) links.push(['/holidays', 'Holidays', 'Regular 1.5× base, special 1.3×'])
  if (canPayroll(profile.role)) links.push(['/payroll', 'Payroll', 'Sunday to Saturday, with CSV'])
  return (
    <div className="stack">
      <h1>Menu</h1>
      {links.map(([to, title, detail]) => (
        <Link key={title} className="menu-link" to={to}>
          <strong>{title}</strong>
          <span>{detail}</span>
        </Link>
      ))}
      <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
    </div>
  )
}
