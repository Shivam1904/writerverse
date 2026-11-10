// SA-259: a coverage lens with five missing items showed "All present — each
// appears somewhere in the text" right under its verdict. That line is the RULE
// the lens checks, not a result, so it must say so.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { chartToVerdict, VerdictSnapshot } from './LensVerdict'

const coverAllChart = {
  type: 'checklist',
  rules: ['cover_all'],
  rules_applied: ['cover_all'],
  analysed_at: '2026-09-18T10:00:00Z',
  y_items: [{ value: 'present' }],
  ticks: [],
  data_points: [],
  offending: ['A', 'B', 'C', 'D', 'E'].map((n) => ({ rule: 'cover_all', label: n, detail: `${n} never appears` })),
}

describe('lens verdict: rule caption', () => {
  it('labels the rule as the rule, apart from the result', () => {
    const verdict = chartToVerdict(coverAllChart)
    render(<VerdictSnapshot verdict={verdict} type="checklist" />)

    // The result is the headline: five items drift.
    expect(screen.getByText(/5 scenes drift/)).toBeTruthy()
    // The rule line is introduced as "Rule:" so "All present" can't read as the result.
    const label = screen.getByText('All present')
    expect(label.parentElement?.textContent).toMatch(/^Rule:\s*All present/)
  })
})

// wrt-46: a lens whose outline order changed since it ran says so.
describe('lens verdict: order changed', () => {
  it('shows the server reason as the outdated note', () => {
    const verdict = chartToVerdict({
      ...coverAllChart, coverage: [{ y_item: 'present', covered: true }],
      stale: true, stale_reason: 'order changed since this lens ran',
    })
    expect(verdict.bars.length).toBeGreaterThan(0)
    render(<VerdictSnapshot verdict={verdict} type="checklist" />)
    expect(screen.getByText('order changed since this lens ran')).toBeTruthy()
  })

  it('never shows an outdated reading as a green ok', () => {
    const fresh = chartToVerdict({ ...coverAllChart, offending: [], coverage: [{ y_item: 'present', covered: true }] })
    expect(fresh.tone).toBe('ok')
    expect(chartToVerdict({ ...coverAllChart, offending: [], coverage: [{ y_item: 'present', covered: true }], stale: true }).tone).toBe('wait')
  })
})
