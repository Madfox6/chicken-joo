import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Selfie({ path, alt }: { path: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!path) {
      setUrl(null)
      return
    }
    supabase.storage.from('selfies').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [path])
  if (!path) return <span className="muted">No selfie</span>
  if (!url) return <span className="muted">Loading photo…</span>
  return <img className="selfie" src={url} alt={alt} />
}
