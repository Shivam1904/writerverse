// SA-166 / SA-176: the "Loose Ends" config preview passes numeric scene ids
// (sample data); the chart used to call .replace on them and crash the page.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DependencyChart } from './DependencyChart'
import { glyphFor } from './glyphs'

describe('DependencyChart', () => {
  it('draws numeric setup/payoff scene ids without crashing', () => {
    const chart = { coverage: [{ name: 'the locket', setup_scene: 1, payoff_scene: 8, closed: true }] } as any
    render(<DependencyChart chart={chart} scenes={[]} staleScenes={new Set()} />)
    expect(screen.getByText('the locket')).toBeTruthy()
  })
})

describe('glyphFor', () => {
  it('accepts a numeric preset id', () => {
    expect(() => glyphFor(42)).not.toThrow()
  })
})
