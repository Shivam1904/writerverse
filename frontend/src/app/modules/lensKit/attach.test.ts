import { beforeEach, describe, expect, it, vi } from 'vitest';

// SA-270: attaching a lens is free. It binds, and never runs the paid analysis.
const api = vi.hoisted(() => ({
  addInvention: vi.fn(async () => ({ id: 'inv-1' })),
  acceptInvention: vi.fn(async () => ({ preset_id: 'p-1' })),
  createPreset: vi.fn(async () => ({ preset_id: 'p-1' })),
  bindGauge: vi.fn(async () => ({ binding_id: 'b-1' })),
  analyseGauge: vi.fn(async () => ({})),
  extractGaugeScale: vi.fn(async () => ({})),
}));
vi.mock('../../pages/gauges/api', () => api);

import { applyAttach, type AttachChoice } from './attach';
import type { CatalogueLens } from './catalogue';

const bankLens = {
  slug: 'story-skeleton', question: 'Does the story hold its shape?', description: '',
  scopeType: 'story', isSection: false, raw: { type: 'arc', y_items: [] },
} as unknown as CatalogueLens;
const sectionLens = { ...bankLens, slug: 'arn-x', isSection: true } as unknown as CatalogueLens;
const choice: AttachChoice = { scope1: { type: 'story', name: 'the whole story' }, walk: 'outline', tick: 'scene' };

beforeEach(() => { Object.values(api).forEach((f) => f.mockClear()); });

describe('applyAttach', () => {
  it('binds a bank lens without running the analysis', async () => {
    const res = await applyAttach('1', bankLens, choice);
    expect(res.bindingId).toBe('b-1');
    expect(api.bindGauge).toHaveBeenCalledTimes(1);
    expect(api.analyseGauge).not.toHaveBeenCalled();
    expect(api.extractGaugeScale).not.toHaveBeenCalled();
  });

  it('binds a section lens without running the analysis', async () => {
    await applyAttach('1', sectionLens, choice);
    expect(api.bindGauge).toHaveBeenCalledTimes(1);
    expect(api.analyseGauge).not.toHaveBeenCalled();
  });

  it('runs only the scale extract the author pressed, still no analysis', async () => {
    await applyAttach('1', bankLens, { ...choice, extract: true });
    expect(api.extractGaugeScale).toHaveBeenCalledWith('1', 'b-1');
    expect(api.analyseGauge).not.toHaveBeenCalled();
  });
});
