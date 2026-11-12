function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

/**
 * Usage for one item over a shift.
 * `received` is everything received between the start count and the end count
 * (receipts written on the start line plus receipts written on the end line).
 */
export function inventoryUsage(startQty: number, received: number, endQty: number): number {
  return roundQty(startQty + received - endQty)
}

export function shiftUsage(
  startQty: number,
  startReceived: number,
  endQty: number,
  endReceived: number,
): number {
  return inventoryUsage(startQty, startReceived + endReceived, endQty)
}

/**
 * A variance is only "previous end ≠ this start".
 * No previous end means there is nothing to compare, so there is no variance.
 * The note is free text and does not change this result.
 */
export function variance(
  previousEnd: number | null,
  startQty: number,
): { hasVariance: boolean; delta: number } {
  if (previousEnd == null || Number.isNaN(previousEnd)) {
    return { hasVariance: false, delta: 0 }
  }
  const delta = roundQty(startQty - previousEnd)
  return { hasVariance: delta !== 0, delta }
}
