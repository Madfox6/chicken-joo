import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { Shell } from './components/Shell'
import { Button, Mark } from './components/ui'
import { ApprovalsScreen } from './screens/ApprovalsScreen'
import { AttendanceScreen } from './screens/AttendanceScreen'
import { CountScreen } from './screens/CountScreen'
import { EmployeesScreen } from './screens/EmployeesScreen'
import { HolidaysScreen } from './screens/HolidaysScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MeScreen } from './screens/MeScreen'
import { MenuScreen } from './screens/MenuScreen'
import { PayrollScreen } from './screens/PayrollScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { StockScreen } from './screens/StockScreen'
import { canPayroll, isManager, seesAll } from './lib/roles'

function Splash() {
  return (
    <main className="login">
      <Mark />
      <h1>Chicken Joo</h1>
    </main>
  )
}

function RequireAuth() {
  const { loading, session, profile, signOut } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
    return (
      <main className="login stack">
        <h1>No staff profile</h1>
        <p className="muted">This login is not on the staff list yet.</p>
        <Button onClick={() => void signOut()}>Sign out</Button>
      </main>
    )
  }
  if (!profile.active) {
    return (
      <main className="login stack">
        <h1>Account inactive</h1>
        <p className="muted">Ask an owner to turn this account back on.</p>
        <Button onClick={() => void signOut()}>Sign out</Button>
      </main>
    )
  }
  return <Shell />
}

function Managers({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile || !isManager(profile.role)) return <p className="banner bad">That screen is for a supervisor or owner.</p>
  return children
}

function Owners({ children, payroll = false }: { children: ReactNode; payroll?: boolean }) {
  const { profile } = useAuth()
  const allowed = profile && (payroll ? canPayroll(profile.role) : seesAll(profile.role))
  if (!allowed) return <p className="banner bad">That screen is for an owner.</p>
  return children
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<RequireAuth />}>
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/count" element={<CountScreen />} />
        <Route path="/me" element={<MeScreen />} />
        <Route path="/menu" element={<Managers><MenuScreen /></Managers>} />
        <Route path="/approvals" element={<Managers><ApprovalsScreen /></Managers>} />
        <Route path="/review" element={<Managers><ReviewScreen /></Managers>} />
        <Route path="/attendance" element={<Managers><AttendanceScreen /></Managers>} />
        <Route path="/stock" element={<Managers><StockScreen /></Managers>} />
        <Route path="/employees" element={<Managers><EmployeesScreen /></Managers>} />
        <Route path="/holidays" element={<Owners><HolidaysScreen /></Owners>} />
        <Route path="/payroll" element={<Owners payroll><PayrollScreen /></Owners>} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
