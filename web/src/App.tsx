import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';
import { ConfirmProvider } from './components/Dialog';
import { ToastProvider } from './components/Toast';
import { PageLoader } from './components/ui';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth, usePublicConfig } from './lib/auth';
import { CodePage, ForcePasswordChangePage, LoginPage, Splash } from './pages/Auth';
import { WorkerApp } from './pages/worker/WorkerApp';

// Manager and developer screens are loaded on demand so the worker app stays small and fast.
const ManagerApp = lazy(() => import('./pages/manager/ManagerApp'));
const DevApp = lazy(() => import('./pages/dev/DevApp'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

function DevCompanyView() {
  const { companyId } = useParams();
  const id = Number(companyId);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/dev" replace />;
  return <ManagerApp companyId={id} base={`/c/${id}`} />;
}

function Root() {
  const { status, user } = useAuth();
  const config = usePublicConfig();
  useEffect(() => {
    if (config?.appName) document.title = config.appName;
  }, [config?.appName]);

  if (status === 'loading') return <Splash />;
  if (status === 'needs-code') return <CodePage />;
  if (status === 'signed-out' || !user) return <LoginPage />;
  if (user.mustChangePassword) return <ForcePasswordChangePage />;

  if (user.role === 'worker') {
    return (
      <Routes>
        <Route path="/w/*" element={<WorkerApp />} />
        <Route path="*" element={<Navigate to="/w" replace />} />
      </Routes>
    );
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {user.role === 'manager' && <Route path="/m/*" element={<ManagerApp base="/m" />} />}
        {user.role === 'developer' && <Route path="/dev/*" element={<DevApp />} />}
        {user.role === 'developer' && <Route path="/c/:companyId/*" element={<DevCompanyView />} />}
        <Route path="*" element={<Navigate to={user.role === 'manager' ? '/m' : '/dev'} replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <BrowserRouter>
              <Root />
            </BrowserRouter>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
