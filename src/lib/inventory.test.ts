import { describe, expect, it } from 'vitest'
import { inventoryUsage, shiftUsage, variance } from './inventory'

describe('inventory usage', () => {
  it('computes usage as start + received − end', () => {
    expect(inventoryUsage(10, 4, 6)).toBe(8)
    expect(inventoryUsage(0, 0, 0)).toBe(0)
    expect(inventoryUsage(1.5, 0.25, 0.75)).toBe(1)
  })

  it('adds receipts written on the start count and the end count', () => {
    expect(shiftUsage(10, 1, 6, 3)).toBe(8)
    expect(shiftUsage(4, 0, 4, 0)).toBe(0)
  })

  it('does not change usage because a variance note was written', () => {
    expect(inventoryUsage(5, 0, 5)).toBe(0)
    expect(variance(4, 5).hasVariance).toBe(true)
  })
})

describe('inventory variance', () => {
  it('flags a start that does not match the previous end', () => {
    expect(variance(8, 5)).toEqual({ hasVariance: true, delta: -3 })
    expect(variance(8, 10)).toEqual({ hasVariance: true, delta: 2 })
  })

  it('is quiet when the start matches the previous end', () => {
    expect(variance(8, 8)).toEqual({ hasVariance: false, delta: 0 })
  })

  it('is quiet when there is no previous end to compare', () => {
    expect(variance(null, 5)).toEqual({ hasVariance: false, delta: 0 })
  })
})
