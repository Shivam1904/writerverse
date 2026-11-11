import { useEffect, useState } from 'react';
import { callOp } from '../../gateway';

export function useWriteEntities(projectId: string | undefined, reloadKey = 0) {
  const [characters, setCharacters] = useState<any[]>([]);
  const [braindumps, setBraindumps] = useState<any[]>([]);
  const [worldbuildings, setWorldbuildings] = useState<any[]>([]);
  // Gates the write-page empty state: we wait for this before choosing between
  // the blank-book fork and the (braindumps-present) lighter scaffold start, so
  // there's no flash of the wrong landing.
  const [loaded, setLoaded] = useState(false);
  // A failed read must not pass as "no braindumps" (SA-132) — the page shows
  // "Couldn't load" instead of picking a first-run landing.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoaded(false);
    setFailed(false);
    Promise.all([
      callOp(projectId, 'get_characters'),
      callOp(projectId, 'get_braindumps'),
      callOp(projectId, 'get_worldbuildings'),
    ]).then(([charRes, bdRes, wbRes]) => {
      if (!alive) return;
      setCharacters(charRes.characters ?? []);
      setBraindumps(bdRes.braindumps ?? []);
      setWorldbuildings(wbRes.worldbuildings ?? []);
      setLoaded(true);
    }).catch(() => {
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, [projectId, reloadKey]);

  return { characters, braindumps, worldbuildings, loaded, failed };
}
