import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWriteStore } from './writeStore';
import { linkSceneEntity, unlinkSceneEntity } from './sceneLinks';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({ callOp: (...a: unknown[]) => callOp(...a) }));

const scene = (entity_links: any[]) => ({
  id: 'sc-1', text: 'S', content: { type: 'doc', content: [] }, words: 0,
  status: 'sketch', entity_links, marginalia: [], analysis: {}, beats: [],
});

function seed(entity_links: any[] = []) {
  useWriteStore.setState({
    data: {
      chapters: [{ id: 1, number: 1, text: 'C', status: 'empty', pov: null, scenes: [scene(entity_links)] }],
      totalWords: 0,
    } as any,
    contentById: {},
    dirtySceneIds: new Set(),
  });
}

const links = () => useWriteStore.getState().data.chapters[0].scenes[0].entity_links;

describe('scene links (SA-87)', () => {
  beforeEach(() => {
    callOp.mockReset();
    seed();
  });

  it('saves through the link op and shows what the server stored', async () => {
    callOp.mockResolvedValue({ entity_links: [{ link_type: 'braindump', link_id: 7 }] });
    await linkSceneEntity('p1', 'sc-1', 'braindump', 7);
    expect(callOp).toHaveBeenCalledWith('p1', 'link_scene_entity', {
      scene_id: 'sc-1', link_type: 'braindump', link_id: 7,
    });
    expect(links()).toEqual([{ link_type: 'braindump', link_id: 7 }]);
  });

  it('never marks the scene prose dirty (no prose save, T133)', async () => {
    callOp.mockResolvedValue({ entity_links: [{ link_type: 'worldbuilding', link_id: 2 }] });
    await linkSceneEntity('p1', 'sc-1', 'worldbuilding', 2);
    expect(useWriteStore.getState().dirtySceneIds.size).toBe(0);
  });

  it('leaves the screen unchanged when the save fails', async () => {
    callOp.mockRejectedValue(new Error('500'));
    await expect(linkSceneEntity('p1', 'sc-1', 'braindump', 7)).rejects.toThrow();
    expect(links()).toEqual([]);
  });

  it('removes a link through the unlink op', async () => {
    seed([{ link_type: 'braindump', link_id: 7 }]);
    callOp.mockResolvedValue({ entity_links: [] });
    await unlinkSceneEntity('p1', 'sc-1', 'braindump', 7);
    expect(callOp).toHaveBeenCalledWith('p1', 'unlink_scene_entity', {
      scene_id: 'sc-1', link_type: 'braindump', link_id: 7,
    });
    expect(links()).toEqual([]);
  });
});

// The old `outlines/<id>/add-entity-link/` endpoint was deleted; every surface
// must go through sceneLinks.ts instead.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

it('no source file calls the dead add-entity-link URL', () => {
  const src = join(__dirname, '..', '..', '..');
  const offenders = sourceFiles(src).filter((f) => readFileSync(f, 'utf8').includes('add-entity-link'));
  expect(offenders).toEqual([]);
});
