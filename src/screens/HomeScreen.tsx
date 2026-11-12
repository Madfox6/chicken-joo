import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Banner, Button } from '../components/ui'
import { getBranches, getOpenLog } from '../lib/data'
import { messageOf } from '../lib/errors'
import { currentGps, prefetchGps } from '../lib/gps'
import { peso } from '../lib/money'
import { compressImage } from '../lib/photo'
import { clockInPreview, minuteDeduction } from '../lib/pay'
import { overlayQueue } from '../lib/queue'
import { seesAll } from '../lib/roles'
import { classifyAttendance, isCountShift, SHIFT_ORDER, SHIFTS, suggestShift, type ShiftCode } from '../lib/shifts'
import { formatManilaTime } from '../lib/manila'
import type { Branch, TimeLog } from '../lib/types'
import { newId, useSync } from '../sync/SyncProvider'

export function HomeScreen() {
  const { profile } = useAuth()
  const { queue, enqueue } = useSync()
  const [branches, setBranches] = useState<Branch[]>([])
  const [serverOpen, setServerOpen] = useState<TimeLog | null>(null)
  const [shift, setShift] = useState<ShiftCode>(() => suggestShift())
  const [branchId, setBranchId] = useState('')
  const [straight, setStraight] = useState(false)
  const [selfie, setSelfie] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [banner, setBanner] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    prefetchGps()
  }, [])

  useEffect(() => {
    if (!profile) return
    getBranches()
      .then((rows) => {
        setBranches(rows)
        setBranchId(profile.branch_id || rows[0]?.id || '')
      })
      .catch((err) => setError(messageOf(err)))
    getOpenLog(profile.id).then(setServerOpen).catch(() => setServerOpen(null))
  }, [profile])

  if (!profile) return null
  const open = overlayQueue(serverOpen, queue)
  const locked = Boolean(profile.branch_id) && !seesAll(profile.role)
  const chosenBranch = locked ? profile.branch_id || '' : branchId
  const branchName = branches.find((branch) => branch.id === (open?.branchId || chosenBranch))?.name ?? 'Branch'
  const preview = clockInPreview(shift, new Date())
  const openMath = open
    ? classifyAttendance({
        shift: open.shift,
        workDate: open.workDate,
        clockIn: new Date(open.clockIn),
        clockOut: null,
        straightDuty: open.straightDuty,
      })
    : null

  async function onPhoto(file: File | undefined) {
    if (!file) return
    const blob = await compressImage(file)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelfie(blob)
    setPreviewUrl(URL.createObjectURL(blob))
  }

  async function clockIn() {
    if (busy || !chosenBranch) return
    setBusy(true)
    setError('')
    const when = new Date()
    const snap = clockInPreview(shift, when)
    const gps = currentGps()
    const hadOpen = Boolean(open)
    const clientId = newId()
    try {
      await enqueue({
        id: clientId,
        kind: 'clock_in',
        selfie: selfie ?? undefined,
        payload: {
          client_id: clientId,
          branch_id: chosenBranch,
          shift_code: shift,
          clock_in: when.toISOString(),
          is_straight_duty: straight,
          gps_in_lat: gps.lat,
          gps_in_lng: gps.lng,
          gps_in_warning: gps.warning,
          selfie_missing: !selfie,
        },
      })
      const late =
        snap.lateMinutes > 15
          ? `Late deduction ${peso(snap.deduction)} (${snap.lateMinutes} min).`
          : snap.lateMinutes > 0
            ? `${snap.lateMinutes} min late, inside grace. No deduction.`
            : snap.early
              ? 'Early clock-in is not overtime.'
              : 'On time.'
      setBanner(
        `${hadOpen ? 'Last clock-out was missing and went to the review list. ' : ''}Clocked in. ${late}`,
      )
      setSelfie(null)
      setStraight(false)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function clockOut() {
    if (!open || busy) return
    setBusy(true)
    setError('')
    const gps = currentGps()
    try {
      await enqueue({
        id: newId(),
        kind: 'clock_out',
        selfie: selfie ?? undefined,
        payload: {
          client_id: open.clientId,
          clock_out: new Date().toISOString(),
          gps_out_lat: gps.lat,
          gps_out_lng: gps.lng,
          gps_out_warning: gps.warning,
        },
      })
      setBanner('Clocked out.')
      setServerOpen(null)
      setSelfie(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div>
        <p className="kicker">{branchName}</p>
        <h1>{open ? 'You’re on the clock' : 'Ready when you are'}</h1>
      </div>
      {banner && <Banner tone="ok">{banner}</Banner>}
      {error && <Banner tone="bad">{error}</Banner>}
      {open && openMath ? (
        <section className="card stack">
          <div className="spread">
            <strong>{SHIFTS[open.shift].label}</strong>
            <span className="muted">In {formatManilaTime(open.clockIn)}</span>
          </div>
          <p className="muted">{SHIFTS[open.shift].start}–{SHIFTS[open.shift].end} · {open.workDate}</p>
          {openMath.lateMinutes > 15 ? (
            <div className="deduction">
              <span>Late deduction</span>
              <strong>{peso(minuteDeduction(openMath.lateMinutes))}</strong>
              <em>{openMath.lateMinutes} minutes. Grace is 15, then every minute counts.</em>
            </div>
          ) : (
            <Banner tone="ok">No late deduction.</Banner>
          )}
          {open.straightDuty && <Banner tone="warn">Straight duty waits for approval before the second shift is paid.</Banner>}
          {open.gpsWarning && <p className="muted">{open.gpsWarning}</p>}
          {open.source === 'phone' && <p className="muted">Saved on this phone. It will sync when you’re online.</p>}
          {isCountShift(open.shift) && (
            <Link className="menu-link" to="/count">
              <strong>Inventory</strong>
              <span>Start count checks the last end. End count before you leave. Clock-out does not wait for it.</span>
            </Link>
          )}
        </section>
      ) : (
        <section className="card stack">
          <div className="chips">
            {SHIFT_ORDER.map((code) => (
              <button key={code} type="button" className={`chip${shift === code ? ' on' : ''}`} onClick={() => setShift(code)}>
                {SHIFTS[code].label}
              </button>
            ))}
          </div>
          <p className="muted">{SHIFTS[shift].start}–{SHIFTS[shift].end} · {preview.workDate}</p>
          {!locked && (
            <div className="chips">
              {branches.map((branch) => (
                <button key={branch.id} type="button" className={`chip${chosenBranch === branch.id ? ' on' : ''}`} onClick={() => setBranchId(branch.id)}>
                  {branch.name}
                </button>
              ))}
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={straight} onChange={(event) => setStraight(event.target.checked)} />
            Straight duty / double shift. Paid only after approval.
          </label>
          {preview.lateMinutes > 15 ? (
            <div className="deduction">
              <span>If you clock in now</span>
              <strong>{peso(preview.deduction)}</strong>
              <em>{preview.lateMinutes} minutes late. The 15-minute grace is already past, so all {preview.lateMinutes} minutes come off the day.</em>
            </div>
          ) : preview.lateMinutes > 0 ? (
            <Banner tone="info">{preview.lateMinutes} min late, still inside the 15-minute grace. No deduction.</Banner>
          ) : preview.early ? (
            <Banner tone="info">Early clock-in is not overtime.</Banner>
          ) : (
            <Banner tone="ok">On time if you clock in now.</Banner>
          )}
        </section>
      )}
      <div className="photo-row">
        <label className="btn btn-ghost btn-block">
          {selfie ? 'Retake selfie' : 'Take selfie'}
          <input
            hidden
            type="file"
            accept="image/*"
            capture="user"
            onChange={(event) => void onPhoto(event.target.files?.[0])}
          />
        </label>
        {previewUrl && <img className="selfie" src={previewUrl} alt="Selfie preview" />}
      </div>
      {open ? (
        <Button big block variant="dark" disabled={busy} onClick={() => void clockOut()}>
          Clock out
        </Button>
      ) : (
        <Button big block disabled={busy || !chosenBranch} onClick={() => void clockIn()}>
          Clock in
        </Button>
      )}
      {!selfie && <p className="muted">A selfie is best, and clock-in still works without one.</p>}
    </div>
  )
}
