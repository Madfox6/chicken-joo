import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { isDuplicate, messageOf } from '../lib/errors'
import { newId } from '../lib/id'
import { listQueue, putQueue, removeQueue } from '../lib/offline'
import { type ClockInPayload, type ClockOutPayload, type InventoryPayload, type QueueItem, type SelfiePayload } from '../lib/queue'
import { supabase } from '../lib/supabase'

type SyncValue = {
  online: boolean
  queue: QueueItem[]
  syncing: boolean
  syncError: string
  enqueue: (item: Omit<QueueItem, 'createdAt'>) => Promise<void>
  sync: () => Promise<void>
}

const SyncContext = createContext<SyncValue | null>(null)

async function uploadSelfie(userId: string, clientId: string, which: 'in' | 'out', blob: Blob): Promise<string | null> {
  if (!navigator.onLine) throw new Error('offline')
  const path = `${userId}/${clientId}-${which}.jpg`
  const { error } = await supabase.storage.from('selfies').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (!error) return path
  if (/fetch|network|offline|Failed to fetch/i.test(error.message)) throw error
  return null
}

async function pushItem(item: QueueItem, userId: string): Promise<void> {
  if (item.kind === 'clock_in') {
    const payload = item.payload as ClockInPayload
    let selfiePath: string | null = null
    if (item.selfie) selfiePath = await uploadSelfie(userId, payload.client_id, 'in', item.selfie)
    const { error } = await supabase.from('time_logs').insert({
      client_id: payload.client_id,
      employee_id: userId,
      branch_id: payload.branch_id,
      shift_code: payload.shift_code,
      clock_in: payload.clock_in,
      is_straight_duty: payload.is_straight_duty,
      selfie_in_path: selfiePath,
      gps_in_lat: payload.gps_in_lat,
      gps_in_lng: payload.gps_in_lng,
      gps_in_warning: payload.selfie_missing && !selfiePath
        ? [payload.gps_in_warning, 'No selfie'].filter(Boolean).join(' · ')
        : payload.gps_in_warning,
    })
    if (error && !isDuplicate(error)) throw error
    return
  }
  if (item.kind === 'clock_out') {
    const payload = item.payload as ClockOutPayload
    let selfiePath: string | null = null
    if (item.selfie) selfiePath = await uploadSelfie(userId, payload.client_id, 'out', item.selfie)
    const { data, error } = await supabase
      .from('time_logs')
      .update({
        clock_out: payload.clock_out,
        selfie_out_path: selfiePath,
        gps_out_lat: payload.gps_out_lat,
        gps_out_lng: payload.gps_out_lng,
        gps_out_warning: payload.gps_out_warning,
      })
      .eq('client_id', payload.client_id)
      .eq('employee_id', userId)
      .select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Clock-in is still syncing')
    return
  }
  if (item.kind === 'inventory') {
    const payload = item.payload as InventoryPayload
    const { error } = await supabase.rpc('submit_inventory_count', {
      p_client_id: payload.client_id,
      p_branch_id: payload.branch_id,
      p_area: payload.area,
      p_shift_code: payload.shift_code,
      p_work_date: payload.work_date,
      p_phase: payload.phase,
      p_lines: payload.lines,
    })
    if (error && /already counted/i.test(error.message ?? '')) {
      throw Object.assign(new Error('Already counted'), { drop: true })
    }
    if (error && !isDuplicate(error)) throw error
    return
  }
  const payload = item.payload as SelfiePayload
  if (!item.selfie) return
  const path = await uploadSelfie(userId, payload.client_id, payload.which, item.selfie)
  if (!path) return
  const column = payload.which === 'in' ? 'selfie_in_path' : 'selfie_out_path'
  const { error } = await supabase.from('time_logs').update({ [column]: path }).eq('client_id', payload.client_id)
  if (error) throw error
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const running = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setQueue(await listQueue())
    } catch {
      setQueue([])
    }
  }, [])

  const sync = useCallback(async () => {
    if (running.current || !navigator.onLine || !session?.user.id) return
    running.current = true
    setSyncing(true)
    try {
      const items = await listQueue()
      for (const item of items) {
        try {
          await pushItem(item, session.user.id)
          await removeQueue(item.id)
          setSyncError('')
        } catch (error) {
          const drop = Boolean((error as { drop?: boolean }).drop)
          if (drop) {
            await removeQueue(item.id)
            setSyncError(messageOf(error))
            continue
          }
          if (item.kind === 'selfie') continue
          setSyncError(messageOf(error))
          break
        }
      }
    } finally {
      running.current = false
      setSyncing(false)
      await refresh()
    }
  }, [refresh, session?.user.id])

  const enqueue = useCallback(
    async (item: Omit<QueueItem, 'createdAt'>) => {
      await putQueue({ ...item, createdAt: Date.now() })
      await refresh()
      void sync()
    },
    [refresh, sync],
  )

  useEffect(() => {
    void refresh().then(() => sync())
  }, [refresh, sync])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void sync()
    }
    const off = () => setOnline(false)
    const visible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [sync])

  const value = useMemo(
    () => ({ online, queue, syncing, syncError, enqueue, sync }),
    [online, queue, syncing, syncError, enqueue, sync],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext)
  if (!value) throw new Error('Sync missing')
  return value
}

export { newId }
