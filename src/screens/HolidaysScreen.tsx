import { useEffect, useState } from 'react'
import { Banner, Button, Empty, Field } from '../components/ui'
import { getHolidays } from '../lib/data'
import { messageOf } from '../lib/errors'
import { formatManilaDate, manilaToday } from '../lib/manila'
import { supabase } from '../lib/supabase'
import type { Holiday, HolidayKind } from '../lib/types'

export function HolidaysScreen() {
  const [rows, setRows] = useState<Holiday[]>([])
  const [date, setDate] = useState(manilaToday())
  const [name, setName] = useState('')
  const [kind, setKind] = useState<HolidayKind>('regular')
  const [error, setError] = useState('')

  async function load() {
    setRows(await getHolidays())
  }

  useEffect(() => {
    load().catch((err) => setError(messageOf(err)))
  }, [])

  async function add() {
    setError('')
    const { error: insertError } = await supabase.from('holidays').upsert(
      { holiday_date: date, name, kind },
      { onConflict: 'holiday_date' },
    )
    if (insertError) setError(insertError.message)
    else {
      setName('')
      await load()
    }
  }

  async function remove(id: string) {
    const { error: deleteError } = await supabase.from('holidays').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else await load()
  }

  return (
    <div className="stack">
      <h1>Holidays</h1>
      <p className="muted">Regular holidays pay 1.5× base. Special holidays pay 1.3× base. Allowance stays the same.</p>
      {error && <Banner tone="bad">{error}</Banner>}
      <section className="card stack">
        <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Kind">
          <select value={kind} onChange={(event) => setKind(event.target.value as HolidayKind)}>
            <option value="regular">Regular · 1.5× base</option>
            <option value="special">Special · 1.3× base</option>
          </select>
        </Field>
        <Button block disabled={name.trim().length < 2} onClick={() => void add()}>Save holiday</Button>
      </section>
      {rows.length === 0 && <Empty>No holidays yet.</Empty>}
      {rows.map((row) => (
        <article key={row.id} className="card spread">
          <div>
            <strong>{row.name}</strong>
            <p className="muted">{formatManilaDate(row.holiday_date)} · {row.kind === 'regular' ? '1.5×' : '1.3×'}</p>
          </div>
          <Button variant="ghost" onClick={() => void remove(row.id)}>Remove</Button>
        </article>
      ))}
    </div>
  )
}
