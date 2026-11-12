const KEY = 'cj-cache-v1'

function bag(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function remember(key: string, value: unknown): void {
  const next = bag()
  next[key] = value
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function recall<T>(key: string): T | undefined {
  const value = bag()[key]
  return value as T | undefined
}
