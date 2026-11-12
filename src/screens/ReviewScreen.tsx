import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button, Empty, Field } from '../components/ui'
import { getLogs, getPeople } from '../lib/data'
import { messageOf } from '../lib/errors'
import { formatManilaDate, formatManilaTime } from '../lib/manila'
import { seesAll } from '../lib/roles'
import { scheduledBounds, SHIFTS } from '../lib/shifts'
import { supabase } from '../lib/supabase'
import type { Profile, TimeLog } from '../lib/types'

export function ReviewScreen() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { date: string; time: string; note: string }>>({})

  async function load() {
    if (!profile) return
    try {
      const branchId = seesAll(profile.role) ? undefined : profile.branch_id ?? undefined
      const [rows, roster] = await Promise.all([
        getLogs({ status: 'needs_review', branchId }),
        getPeople(),
      ])
      setLogs(rows)
      setPeople(roster)
      const next: Record<string, { date: string; time: string; note: string }> = {}
      for (const log of rows) {
        const end = scheduledBounds(log.shift_code, log.work_date).end
        const manila = new Date(end.getTime())
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(manila)
        const bag: Record<string, string> = {}
        for (const part of parts) if (part.type !== 'literal') bag[part.type] = part.value
        next[log.id] = {
          date: `${bag.year}-${bag.month}-${bag.day}`,
          time: `${bag.hour}:${bag.minute}`,
          note: log.review_note ?? '',
        }
      }
      setDrafts(next)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  useEffect(() => {
    void load()
    // The loader closes over the signed-in profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function save(log: TimeLog) {
    const draft = drafts[log.id]
    if (!draft) return
    const clockOut = new Date(`${draft.date}T${draft.time}:00+08:00`).toISOString()
    const { error: updateError } = await supabase
      .from('time_logs')
      .update({ clock_out: clockOut, review_note: draft.note || null })
      .eq('id', log.id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  const nameOf = (id: string) => people.find((person) => person.id === id)?.full_name ?? 'Employee'

  return (
    <div className="stack">
      <div className="spread">
        <h1>Missed clock-outs</h1>
        <Button variant="ghost" onClick={() => void load()}>Refresh</Button>
      </div>
      <p className="muted">A missing clock-out never blocks the next clock-in. Put the real time here.</p>
      {error && <Banner tone="bad">{error}</Banner>}
      {logs.length === 0 && <Empty>No missed clock-outs.</Empty>}
      {logs.map((log) => {
        const draft = drafts[log.id]
        return (
          <article key={log.id} className="card stack">
            <strong>{nameOf(log.employee_id)}</strong>
            <p className="muted">
              {formatManilaDate(log.work_date)} · {SHIFTS[log.shift_code].label} · in {formatManilaTime(log.clock_in)}
            </p>
            {draft && (
              <>
                <Field label="Clock-out date">
                  <input type="date" value={draft.date} onChange={(event) => setDrafts((current) => ({ ...current, [log.id]: { ...draft, date: event.target.value } }))} />
                </Field>
                <Field label="Clock-out time">
                  <input type="time" value={draft.time} onChange={(event) => setDrafts((current) => ({ ...current, [log.id]: { ...draft, time: event.target.value } }))} />
                </Field>
                <Field label="Note">
                  <input value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [log.id]: { ...draft, note: event.target.value } }))} />
                </Field>
                <Button block onClick={() => void save(log)}>Save clock-out</Button>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}
