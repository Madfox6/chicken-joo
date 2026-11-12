export function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Something went wrong')
  if (/already counted/i.test(raw)) return 'Already counted'
  if (/invalid login/i.test(raw)) return 'Code or PIN is not right'
  if (/inactive/i.test(raw)) return 'This account is inactive'
  if (/failed to fetch|networkerror|offline|load failed/i.test(raw)) return 'You are offline. It will sync when the signal comes back.'
  if (/functionsrelayerror|functionsfetcherror|failed to send a request/i.test(raw)) {
    return 'That needs the edge function deployed. See the README.'
  }
  return raw
}

export function isDuplicate(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|already counted/i.test(error.message ?? '')
}
