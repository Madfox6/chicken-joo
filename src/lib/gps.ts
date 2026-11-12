export type GpsCapture = {
  lat: number | null
  lng: number | null
  warning: string | null
}

let cached: GpsCapture = {
  lat: null,
  lng: null,
  warning: 'Location not ready — clock-in still counts',
}

export function currentGps(): GpsCapture {
  return cached
}

export function prefetchGps(): void {
  if (!navigator.geolocation) {
    cached = { lat: null, lng: null, warning: 'This phone has no GPS. Clock-in still counts.' }
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const accuracy = pos.coords.accuracy
      cached = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        warning: accuracy > 1500 ? `GPS is rough (±${Math.round(accuracy)} m). Clock-in still counts.` : null,
      }
    },
    () => {
      cached = { lat: null, lng: null, warning: 'Location is off. Clock-in still counts.' }
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
  )
}
