import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Empty } from '../components/ui'
import { getAreas, getBranches, getItems, getOpenLog } from '../lib/data'
import { messageOf } from '../lib/errors'
import { manilaToday } from '../lib/manila'
import { shiftUsage, variance } from '../lib/inventory'
import { queuedCount, overlayQueue, type InventoryLineInput } from '../lib/queue'
import { seesAll } from '../lib/roles'
import { AREA_LABEL, isCountShift, previousCountSlot, SHIFT_ORDER, SHIFTS, suggestShift, type CountShift } from '../lib/shifts'
import { supabase } from '../lib/supabase'
import type { Branch, BranchArea, Item } from '../lib/types'
import { newId, useSync } from '../sync/SyncProvider'

type Draft = { quantity: string; received: string; note: string }

export function CountScreen() {
  const { profile } = useAuth()
  const { queue, enqueue } = useSync()
  const queueRef = useRef(queue)
  queueRef.current = queue
  const [branches, setBranches] = useState<Branch[]>([])
  const [areas, setAreas] = useState<BranchArea[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [shift, setShift] = useState<CountShift>('am')
  const [workDate, setWorkDate] = useState(manilaToday())
  const [branchId, setBranchId] = useState('')
  const [area, setArea] = useState('')
  const [phase, setPhase] = useState<'start' | 'end'>('start')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [previous, setPrevious] = useState<Record<string, number>>({})
  const [existingBy, setExistingBy] = useState<string>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    Promise.all([getBranches(), getAreas(), getItems(), getOpenLog(profile.id)])
      .then(([branchRows, areaRows, itemRows, openLog]) => {
        setBranches(branchRows)
        setAreas(areaRows)
        setItems(itemRows.filter((item) => item.active))
        const local = overlayQueue(openLog, queueRef.current)
        const nextShift = local && isCountShift(local.shift) ? local.shift : suggestShift()
        setShift(isCountShift(nextShift) ? nextShift : 'am')
        if (local && isCountShift(local.shift)) setWorkDate(local.workDate)
        setBranchId(local?.branchId || profile.branch_id || branchRows[0]?.id || '')
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false))
  }, [profile])

  const branchAreas = areas.filter((row) => row.branch_id === branchId)
  useEffect(() => {
    if (!area && branchAreas[0]) setArea(branchAreas[0].area)
    if (area && branchAreas.length && !branchAreas.some((row) => row.area === area)) {
      setArea(branchAreas[0].area)
    }
  }, [area, branchAreas])

  useEffect(() => {
    if (!profile || !branchId || !area || !isCountShift(shift)) return
    let cancelled = false
    setExistingBy('')
    setPrevious({})
    const prev = previousCountSlot(shift, workDate)
    Promise.all([
      supabase
        .from('inventory_counts')
        .select('employee_id, profiles(full_name)')
        .eq('branch_id', branchId)
        .eq('area', area)
        .eq('shift_code', shift)
        .eq('work_date', workDate)
        .eq('phase', phase)
        .maybeSingle(),
      phase === 'start'
        ? supabase
            .from('inventory_counts')
            .select('inventory_lines(item_id, quantity)')
            .eq('branch_id', branchId)
            .eq('area', area)
            .eq('shift_code', prev.shift)
            .eq('work_date', prev.workDate)
            .eq('phase', 'end')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]).then(([current, prior]) => {
      if (cancelled) return
      const person = current.data?.profiles as { full_name?: string } | { full_name?: string }[] | null
      const name = Array.isArray(person) ? person[0]?.full_name : person?.full_name
      if (current.data) setExistingBy(name || 'someone')
      const lines = (prior.data?.inventory_lines ?? []) as Array<{ item_id: string; quantity: number }>
      const map: Record<string, number> = {}
      for (const line of lines) map[line.item_id] = Number(line.quantity)
      setPrevious(map)
    }).catch(() => {
      if (!cancelled) setPrevious({})
    })
    return () => {
      cancelled = true
    }
  }, [profile, branchId, area, shift, workDate, phase])

  if (!profile) return null
  const locked = Boolean(profile.branch_id) && !seesAll(profile.role)
  const queued = branchId && area
    ? queuedCount(queue, { branch_id: branchId, area, shift_code: shift, work_date: workDate, phase })
    : null

  function draftFor(id: string): Draft {
    return drafts[id] ?? { quantity: '', received: '0', note: '' }
  }

  async function submit() {
    if (!profile) return
    setError('')
    setMessage('')
    const lines: InventoryLineInput[] = items.map((item) => {
      const draft = draftFor(item.id)
      return {
        item_id: item.id,
        quantity: Number(draft.quantity),
        received: Number(draft.received || 0),
        variance_note: draft.note.trim(),
      }
    })
    if (items.some((item) => draftFor(item.id).quantity.trim() === '') || lines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 0)) {
      setError('Enter a count for each item. Use 0 if you have none.')
      return
    }
    const clientId = newId()
    try {
      await enqueue({
        id: clientId,
        kind: 'inventory',
        payload: {
          client_id: clientId,
          branch_id: branchId,
          area,
          shift_code: shift,
          work_date: workDate,
          phase,
          lines,
        },
      })
      setMessage(phase === 'start' ? 'Start count saved.' : 'End count saved.')
      setExistingBy(profile.full_name)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <div className="stack">
      <div>
        <p className="kicker">Inventory</p>
        <h1>{phase === 'start' ? 'Start count' : 'End count'}</h1>
      </div>
      {message && <Banner tone="ok">{message}</Banner>}
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="chips">
        {SHIFT_ORDER.filter(isCountShift).map((code) => (
          <button key={code} type="button" className={`chip${shift === code ? ' on' : ''}`} onClick={() => setShift(code)}>
            {SHIFTS[code].label}
          </button>
        ))}
      </div>
      <p className="muted">Mid AM and Mid PM don’t count. AM checks last night’s graveyard, PM checks AM, graveyard checks PM.</p>
      <div className="chips">
        <button type="button" className={`chip${phase === 'start' ? ' on' : ''}`} onClick={() => setPhase('start')}>Start</button>
        <button type="button" className={`chip${phase === 'end' ? ' on' : ''}`} onClick={() => setPhase('end')}>End</button>
      </div>
      {!locked && (
        <div className="chips">
          {branches.map((branch) => (
            <button key={branch.id} type="button" className={`chip${branchId === branch.id ? ' on' : ''}`} onClick={() => setBranchId(branch.id)}>
              {branch.name}
            </button>
          ))}
        </div>
      )}
      <div className="chips">
        {branchAreas.map((row) => (
          <button key={row.id} type="button" className={`chip${area === row.area ? ' on' : ''}`} onClick={() => setArea(row.area)}>
            {AREA_LABEL[row.area]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Date</span>
        <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
      </label>
      {loading && <p className="muted">Loading items…</p>}
      {!loading && branchAreas.length === 0 && <Empty>No count area is set for this branch yet.</Empty>}
      {queued && <Banner tone="warn">This count is waiting to sync.</Banner>}
      {existingBy && !queued && (
        <Banner tone="info">{existingBy === profile.full_name ? 'Count saved.' : `Already counted by ${existingBy}.`}</Banner>
      )}
      {!existingBy && !queued && items.map((item) => {
        const draft = draftFor(item.id)
        const qty = Number(draft.quantity)
        const prev = previous[item.id]
        const diff = phase === 'start' && draft.quantity !== '' ? variance(prev ?? null, qty) : { hasVariance: false, delta: 0 }
        return (
          <section key={item.id} className="card stack">
            <div className="spread">
              <strong>{item.name.replace(' (sample)', '')}</strong>
              {item.is_sample && <span className="badge">Sample</span>}
            </div>
            {phase === 'start' && (
              <p className="muted">{prev == null ? 'No previous end.' : `Last end: ${prev} ${item.unit}`}</p>
            )}
            <div className="grid">
              <label className="field">
                <span>On hand ({item.unit})</span>
                <input inputMode="decimal" value={draft.quantity} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, quantity: event.target.value } }))} />
              </label>
              <label className="field">
                <span>Received</span>
                <input inputMode="decimal" value={draft.received} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, received: event.target.value } }))} />
              </label>
            </div>
            {diff.hasVariance && (
              <label className="field">
                <span>Variance note ({diff.delta > 0 ? '+' : ''}{diff.delta}). Optional.</span>
                <input value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))} />
              </label>
            )}
          </section>
        )
      })}
      {!existingBy && !queued && items.length > 0 && branchAreas.length > 0 && (
        <Button big block onClick={() => void submit()}>Save {phase} count</Button>
      )}
      {phase === 'end' && <p className="muted">Usage = start + received − end. A mismatch with the last end is only a note.</p>}
      <UsageHint />
    </div>
  )
}

function UsageHint() {
  return <p className="muted">Example: start 10, received 4, end 6 uses {shiftUsage(10, 0, 6, 4)}.</p>
}
