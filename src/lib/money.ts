export function roundPeso(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function peso(amount: number): string {
  const negative = amount < 0
  const formatted = Math.abs(roundPeso(amount)).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${negative ? '−' : ''}₱${formatted}`
}
