// Unauthenticated demo/dev pages. Only ever loaded from App.tsx behind
// `import.meta.env.DEV`, so none of this ships in the production build.
import { Routes, Route, Navigate } from 'react-router-dom';
import DevLogs from './pages/DevLogs';
import DevLensCatalogue from './pages/DevLensCatalogue';
import DemoChaptersPage from './demo/DemoChaptersPage';
import DemoWeavePage from './demo/DemoWeavePage';
import ShowcaseUI from './app/pages/showcase/ShowcaseUI';
import ShowcaseUIPages from './app/pages/showcase/ShowcaseUIPages';
import ShowcaseArnBlock from './app/pages/showcase/ShowcaseArnBlock';

// Mounted at `/demo/*` or `/dev/*`; paths here are relative to that prefix.
export default function DevOnlyRoutes({ group }: { group: 'demo' | 'dev' }) {
  return (
    <Routes>
      {group === 'demo' && (
        <>
          <Route path="chapters" element={<DemoChaptersPage />} />
          <Route path="weave" element={<DemoWeavePage />} />
          <Route path="showcase-ui" element={<ShowcaseUI />} />
          <Route path="showcase-ui-pages" element={<ShowcaseUIPages />} />
          <Route path="showcase-arn" element={<ShowcaseArnBlock />} />
        </>
      )}
      {group === 'dev' && (
        <>
          <Route path="logs" element={<DevLogs />} />
          <Route path="lens-catalogue" element={<DevLensCatalogue />} />
        </>
      )}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
