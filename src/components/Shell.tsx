import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { isManager } from '../lib/roles'
import { useSync } from '../sync/SyncProvider'
import { Mark } from './ui'

export function Shell() {
  const { profile } = useAuth()
  const { online, queue, syncError } = useSync()
  const manager = profile ? isManager(profile.role) : false
  const waiting = queue.length
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <strong>Chicken Joo</strong>
            <span>{profile?.full_name}</span>
          </div>
        </div>
        <span className={`pill ${online ? 'ok' : 'warn'}`}>{online ? 'Online' : 'Offline'}</span>
      </header>
      {waiting > 0 && (
        <div className="syncbar">
          {waiting} waiting to sync{syncError ? ` · ${syncError}` : ''}
        </div>
      )}
      <main className="page">
        <Outlet />
      </main>
      <nav>
        <NavLink to="/home">Home</NavLink>
        <NavLink to="/count">Count</NavLink>
        {manager ? <NavLink to="/menu">Menu</NavLink> : <NavLink to="/me">Pay</NavLink>}
      </nav>
    </div>
  )
}
