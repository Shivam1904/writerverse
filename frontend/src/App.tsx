import React, { Suspense, lazy } from 'react'
import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import { useAuthStore } from './stores/authStore';
import { ToastProvider } from './components/common/ToastProvider';
import { ThemeProvider } from './app/theme/ThemeProvider';
import { PageLoading } from './app/components/LoadError';
import { withChunkReload } from './app/lib/chunkReload';
import axios from 'axios';
import { extensions } from './app/extensions';

// Page-level routes are lazy: each is its own build chunk, downloaded the first
// time it renders (inside the one <Suspense> around <Routes>). The small auth
// pages stay in the main bundle, since a signed-out visitor sees them first.
// The project shell lazy-loads its own section pages too (pages/registry.ts).
// withChunkReload: if a chunk is gone after a deploy, reload the page once.
const Library = lazy(withChunkReload(() => import('./app/pages/library/Library')));
const ProfileSettingsPage = lazy(withChunkReload(() => import('./components/ProfileSettingsPage')));
const ProjectShell = lazy(withChunkReload(() => import('./app/ProjectShell')));

// Unauthenticated demo/dev pages exist only in `vite dev`. The import sits behind
// the DEV constant, so the production build drops these pages entirely (SA-104).
const DevOnlyRoutes = import.meta.env.DEV ? lazy(() => import('./devOnlyRoutes')) : null;

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Axios interceptor for automatic token refresh is now configured in authStore.ts

// Holds rendering until auth has settled (a persisted-but-expired access token
// is refreshed first). The app shell fires authenticated data fetches the
// moment it mounts; without this gate those requests race the token refresh,
// 401, get swallowed into empty data, and the page renders blank until reload.
const AuthGate: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const initialized = useAuthStore((s) => s.initialized);
  return initialized ? children : null;
};

// Old book links used /projectv2/...; send them to the same page under /project/,
// keeping the rest of the path, the query string and the hash.
const OldProjectUrlRedirect: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={pathname.replace(/^\/projectv2(?=\/|$)/, '/project') + search + hash} replace />;
};

// Component to protect routes
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, initialized } = useAuthStore();
  // Wait for the auth check before deciding — otherwise a refresh flashes the
  // login page before checkAuthStatus has validated the persisted token.
  if (!initialized) return null;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Component to redirect authenticated users from auth pages
const AuthRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/library" /> : children;
};

function App() {
  const { tokens, checkAuthStatus } = useAuthStore();

  useEffect(() => {
    // Check authentication status on app load
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    // Set default Authorization header for all requests if token exists
    if (tokens?.access) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${tokens.access}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [tokens]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <Router>
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  {/* Public Routes */}
                  {/* Authentication Routes */}
                  <Route
                    path="/login"
                    element={
                      <AuthRoute>
                        <LoginPage />
                      </AuthRoute>
                    }
                  />
                  <Route
                    path="/signup"
                    element={
                      <AuthRoute>
                        <SignupPage />
                      </AuthRoute>
                    }
                  />
                  <Route
                    path="/forgot-password"
                    element={
                      <AuthRoute>
                        <ForgotPasswordPage />
                      </AuthRoute>
                    }
                  />
                  {/* Not an AuthRoute: a reset link must work even with a session
                      open (maybe someone else's). The page signs out once the
                      new password is set. */}
                  <Route path="/reset-password" element={<ResetPasswordPage />} />

                  {/* Not an AuthRoute either: the link signs this browser in as
                      the account it confirms, replacing any open session. */}
                  <Route path="/verify-email" element={<VerifyEmailPage />} />

                  {/* Protected Routes */}
                  <Route
                    path="/library"
                    element={
                      <ProtectedRoute>
                        <Library />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/dashboard" element={<Navigate to="/library" replace />} />
                  <Route path="/" element={<Navigate to="/library" replace />} />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <ProfileSettingsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Extension pages (app/extensions.ts) */}
                  {extensions.routes?.map((r) => (
                    <Route
                      key={r.path}
                      path={r.path}
                      element={r.auth === 'public' ? r.element : <ProtectedRoute>{r.element}</ProtectedRoute>}
                    />
                  ))}

                  {/* The app shell. Unprotected during UI-first dev,
                  but still gated on auth-settle so its first data fetches carry a
                  refreshed token (AuthGate waits for `initialized`, not for login). */}
                  <Route path="/project/:projectId" element={<AuthGate><ProjectShell /></AuthGate>} />
                  <Route path="/project/:projectId/:section" element={<AuthGate><ProjectShell /></AuthGate>} />
                  <Route path="/project/:projectId/characters/:characterId" element={<AuthGate><ProjectShell /></AuthGate>} />
                  {/* Character detail page. Both the bare and the /studio route render
                  CharacterStudioPage (the old PersonPage was deleted, SA-95). */}
                  <Route path="/project/:projectId/characters/:characterId/studio" element={<AuthGate><ProjectShell /></AuthGate>} />
                  {/* generic section sub-route (e.g. gauges/bank, gauges/:id). The specific
                  characters/:characterId route above out-ranks this for characters. */}
                  <Route path="/project/:projectId/:section/:sub" element={<AuthGate><ProjectShell /></AuthGate>} />

                  <Route path="/projectv2/*" element={<OldProjectUrlRedirect />} />

                  {/* Demo + dev pages: dev server only, never registered in production */}
                  {DevOnlyRoutes && <Route path="/demo/*" element={<DevOnlyRoutes group="demo" />} />}
                  {DevOnlyRoutes && <Route path="/dev/*" element={<DevOnlyRoutes group="dev" />} />}

                  {/* Catch all route */}
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Suspense>
            </Router>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
