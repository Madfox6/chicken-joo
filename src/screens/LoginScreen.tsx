import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Field, Mark } from '../components/ui'
import { messageOf } from '../lib/errors'

export function LoginScreen() {
  const { session, profile, loading, signIn } = useAuth()
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile?.active) return <Navigate to="/home" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(code, pin)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <Mark />
      <h1>Chicken Joo</h1>
      <p className="muted">Patts · CAA · Paco · Valley 1</p>
      <form className="stack" onSubmit={submit}>
        <Field label="Employee code">
          <input
            autoCapitalize="characters"
            autoComplete="username"
            inputMode="text"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="4-digit PIN">
          <input
            className="pin"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </Field>
        {error && <Banner tone="bad">{error}</Banner>}
        <Button big block disabled={busy || pin.length !== 4 || code.trim().length < 3}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  )
}
