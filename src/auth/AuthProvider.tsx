import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isPin, pinToPassword, staffEmail } from '../lib/auth'
import { getProfile } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

type AuthValue = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  signIn: (code: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user.id) return
    let cancelled = false
    setLoading(true)
    getProfile(session.user.id)
      .then((row) => {
        if (!cancelled) setProfile(row)
      })
      .catch(() => {
        if (!cancelled) setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      profile,
      async signIn(code: string, pin: string) {
        if (!isPin(pin)) throw new Error('PIN is 4 digits')
        const { error } = await supabase.auth.signInWithPassword({
          email: staffEmail(code),
          password: pinToPassword(pin),
        })
        if (error) throw error
      },
      async signOut() {
        await supabase.auth.signOut()
      },
      async refreshProfile() {
        if (!session?.user.id) return
        setProfile(await getProfile(session.user.id))
      },
    }),
    [loading, session, profile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('Auth missing')
  return value
}
