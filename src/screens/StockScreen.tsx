import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Empty, Field } from '../components/ui'
import { getAreas, getBranches, getItems, getPeople } from '../lib/data'
import { messageOf } from '../lib/errors'
import { shiftUsage, variance } from '../lib/inventory'
import { manilaToday } from '../lib/manila'
import { canEditItems, seesAll } from '../lib/roles'
import { AREA_LABEL, SHIFTS, type CountShift } from '../lib/shifts'
import { supabase } from '../lib/supabase'
import type { AreaCode, Branch, BranchArea, Item, Profile } from '../lib/types'

type Line = {
  itemId: string
  name: string
  unit: string
  quantity: number
  received: number
  previousEnd: number | null
  delta: number | null
  note: string | null
}

type CountRow = {
  id: string
  area: string
  shift: CountShift
  phase: 'start' | 'end'
  employeeId: string
  lines: Line[]
}

export function StockScreen() {
  const { profile } = useAuth()
  const [date, setDate] = useState(manilaToday())
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [counts, setCounts] = useState<CountRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [areas, setAreas] = useState<BranchArea[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [error, setError] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemUnit, setItemUnit] = useState('pc')
  const [newArea, setNewArea] = useState<AreaCode>('cashier')

  async function load(nextDate = date, nextBranch = branchId) {
    if (!profile) return
    const branchRows = await getBranches()
    const chosen = nextBranch || profile.branch_id || branchRows[0]?.id || ''
    setBranches(branchRows)
    setBranchId(chosen)
    const [itemRows, areaRows, roster] = await Promise.all([getItems(), getAreas(), getPeople()])
    setItems(itemRows)
    setAreas(areaRows)
    setPeople(roster)
    const { data, error: queryError } = await supabase
      .from('inventory_counts')
      .select('id, area, shift_code, phase, employee_id, inventory_lines(item_id, quantity, received, previous_end, variance_delta, variance_note, inventory_items(name, unit))')
      .eq('work_date', nextDate)
      .eq('branch_id', chosen)
    if (queryError) throw queryError
    setCounts((data ?? []).map((row) => {
      const record = row as Record<string, unknown>
      const lines = (record.inventory_lines as Array<Record<string, unknown>> | null) ?? []
      return {
        id: String(record.id),
        area: String(record.area),
        shift: record.shift_code as CountShift,
        phase: record.phase as 'start' | 'end',
        employeeId: String(record.employee_id),
        lines: lines.map((line) => {
          const item = line.inventory_items as { name?: string; unit?: string } | null
          return {
            itemId: String(line.item_id),
            name: item?.name ?? 'Item',
            unit: item?.unit ?? '',
            quantity: Number(line.quantity),
            received: Number(line.received),
            previousEnd: line.previous_end == null ? null : Number(line.previous_end),
            delta: line.variance_delta == null ? null : Number(line.variance_delta),
            note: line.variance_note ? String(line.variance_note) : null,
          }
        }),
      }
    }))
  }

  useEffect(() => {
    if (!profile) return
    load().catch((err) => setError(messageOf(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  if (!profile) return null
  const owner = canEditItems(profile.role)
  const nameOf = (id: string) => people.find((person) => person.id === id)?.full_name ?? 'Staff'
  const groups = new Map<string, { start?: CountRow; end?: CountRow }>()
  for (const count of counts) {
    const key = `${count.area}|${count.shift}`
    const group = groups.get(key) ?? {}
    group[count.phase] = count
    groups.set(key, group)
  }

  async function removeCount(id: string) {
    const { error: deleteError } = await supabase.from('inventory_counts').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else await load()
  }

  async function addItem() {
    const { error: insertError } = await supabase.from('inventory_items').insert({
      name: itemName.trim(),
      unit: itemUnit.trim() || 'pc',
      is_sample: false,
      active: true,
      sort_order: items.length + 1,
    })
    if (insertError) setError(insertError.message)
    else {
      setItemName('')
      await load()
    }
  }

  async function archiveItem(id: string, active: boolean) {
    const { error: updateError } = await supabase.from('inventory_items').update({ active }).eq('id', id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  async function addArea() {
    const { error: insertError } = await supabase.from('branch_areas').insert({ branch_id: branchId, area: newArea })
    if (insertError) setError(insertError.message)
    else await load()
  }

  return (
    <div className="stack">
      <h1>Stock</h1>
      <label className="field">
        <span>Date</span>
        <input type="date" value={date} onChange={(event) => { setDate(event.target.value); void load(event.target.value, branchId).catch((err) => setError(messageOf(err))) }} />
      </label>
      {seesAll(profile.role) && (
        <div className="chips">
          {branches.map((branch) => (
            <button key={branch.id} type="button" className={`chip${branchId === branch.id ? ' on' : ''}`} onClick={() => void load(date, branch.id).then(() => setBranchId(branch.id)).catch((err) => setError(messageOf(err)))}>
              {branch.name}
            </button>
          ))}
        </div>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      {[...groups.entries()].length === 0 && <Empty>No counts for this day.</Empty>}
      {[...groups.entries()].map(([key, group]) => {
        const [area, shift] = key.split('|')
        const names = new Map<string, Line>()
        for (const line of group.start?.lines ?? []) names.set(line.itemId, line)
        for (const line of group.end?.lines ?? []) if (!names.has(line.itemId)) names.set(line.itemId, line)
        return (
          <section key={key} className="card stack">
            <strong>{AREA_LABEL[area] ?? area} · {SHIFTS[shift as CountShift].label}</strong>
            <p className="muted">
              {group.start ? `Start by ${nameOf(group.start.employeeId)}` : 'No start count'}
              {' · '}
              {group.end ? `End by ${nameOf(group.end.employeeId)}` : 'No end count'}
            </p>
            {[...names.values()].map((line) => {
              const start = group.start?.lines.find((row) => row.itemId === line.itemId)
              const end = group.end?.lines.find((row) => row.itemId === line.itemId)
              const diff = start ? variance(start.previousEnd, start.quantity) : { hasVariance: false, delta: 0 }
              const usage = start && end ? shiftUsage(start.quantity, start.received, end.quantity, end.received) : null
              return (
                <div key={line.itemId}>
                  <div className="spread">
                    <span>{line.name}</span>
                    <strong>{usage == null ? '—' : `${usage} ${line.unit}`}</strong>
                  </div>
                  {diff.hasVariance && (
                    <p className="muted">Variance {diff.delta > 0 ? '+' : ''}{diff.delta}{start?.note ? ` · ${start.note}` : ''}</p>
                  )}
                </div>
              )
            })}
            {seesAll(profile.role) && group.start && <Button variant="ghost" onClick={() => void removeCount(group.start!.id)}>Delete start count</Button>}
            {seesAll(profile.role) && group.end && <Button variant="ghost" onClick={() => void removeCount(group.end!.id)}>Delete end count</Button>}
          </section>
        )
      })}
      {owner && (
        <section className="card stack">
          <h2>Items</h2>
          <p className="muted">Sample items are marked. Archive them when the real list is ready.</p>
          {items.map((item) => (
            <div key={item.id} className="spread">
              <span>{item.name}{item.is_sample ? ' · sample' : ''}{item.active ? '' : ' · archived'}</span>
              <Button variant="ghost" onClick={() => void archiveItem(item.id, !item.active)}>{item.active ? 'Archive' : 'Restore'}</Button>
            </div>
          ))}
          <Field label="New item"><input value={itemName} onChange={(event) => setItemName(event.target.value)} /></Field>
          <Field label="Unit"><input value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} /></Field>
          <Button block disabled={itemName.trim().length < 2} onClick={() => void addItem()}>Add item</Button>
        </section>
      )}
      {seesAll(profile.role) && (
        <section className="card stack">
          <h2>Areas at this branch</h2>
          {areas.filter((row) => row.branch_id === branchId).map((row) => (
            <div key={row.id} className="spread">
              <span>{AREA_LABEL[row.area]}</span>
              <Button variant="ghost" onClick={() => void supabase.from('branch_areas').delete().eq('id', row.id).then(() => load())}>Remove</Button>
            </div>
          ))}
          <Field label="Add area">
            <select value={newArea} onChange={(event) => setNewArea(event.target.value as AreaCode)}>
              <option value="cashier">Cashier</option>
              <option value="kitchen">Kitchen</option>
              <option value="cashier_kitchen">Cashier / Kitchen</option>
            </select>
          </Field>
          <Button block onClick={() => void addArea()}>Add area</Button>
        </section>
      )}
    </div>
  )
}
