import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './story-so-far.css';
import { EMPTY_STORY, loadStorySoFar } from './data';
import { STORY_SO_FAR_BOXES } from './boxes.config';
import { PageHeader } from './components/PageHeader';
import { ScenesStrip } from './components/ScenesStrip';
import { BOXES } from '../../modules/boxes/registry';
import { Box } from '../../modules/boxes/Box';
import { getSuggestions, setStatus } from '../../modules/suggestions/service';
import { ExpandedNotification } from '../../modules/suggestions/views/ExpandedNotification';

/**
 * Story so far — the honest map of what the author has written, scoped to the
 * project in the URL.
 *
 * The data-type cards are now config-driven **boxes** (modules/boxes): the page
 * declares which boxes to show in boxes.config.ts; People is always shown, the
 * rest only when they have data. Scenes strip + suggestions stay siblings.
 * Frontend-only: data through the loose seam (data.ts) — empty by default.
 */
export function StorySoFarPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [pageData, setPageData] = useState(EMPTY_STORY);
  const [scenes, setScenes] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  // Fetch the project's data + suggestions through the Gateway.
  useEffect(() => {
    let alive = true;
    loadStorySoFar(projectId).then((d) => {
      if (!alive) return;
      setPageData(d);
      setScenes(d.scenes ?? []);
    });
    getSuggestions(projectId).then((s) => {
      if (alive) setSuggestions(s);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // People always; the rest only when their source has data. Layout (half/full)
  // comes from each box's config: People + Items share the top row, Rules spans.
  const visible = STORY_SO_FAR_BOXES.filter((cfg) => {
    if (cfg.visibleWhen === 'always') return true;
    const def = BOXES[cfg.kind];
    const d = def ? pageData[def.dataKey] : [];
    return (d?.length ?? 0) > 0;
  });

  function addScene() {
    setScenes((prev) => [...prev, { id: `draft-${Date.now()}`, label: 'new scene' }]);
  }

  function handleSuggestionAction(s, a) {
    if (a.kind === 'dismiss') {
      setStatus(s.id, 'dismissed');
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      return;
    }
    // watch / browse → the Lenses page (where binding actually happens).
    if (a.id === 'watch' || a.id === 'browse') {
      navigate(`/project/${projectId}/lenses`);
    }
  }

  return (
    <div className="wv2-page ssf-page">
      <div className="wv2-page-main">
        <PageHeader />

        <div className="wv2-boxes">
          {visible.map((cfg) => (
            <Box
              key={cfg.kind}
              kind={cfg.kind}
              view={cfg.view}
              width={cfg.width}
              data={pageData[BOXES[cfg.kind].dataKey]}
            />
          ))}
        </div>

        <ScenesStrip scenes={scenes} onReorder={setScenes} onAddScene={addScene} />

        {/* prominent surface — cap at a few so it doesn't become a wall of cards */}
        {suggestions.slice(0, 3).map((s) => (
          <ExpandedNotification key={s.id} suggestion={s} onAction={handleSuggestionAction} />
        ))}
      </div>
    </div>
  );
}
