import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import { api, ApiError } from './lib/api';
import { useMe } from './lib/hooks';
import { Spinner } from './components/ui';
import { SetupPage } from './pages/SetupPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages';
import { AppLayout } from './components/AppLayout';
import { HomePage } from './pages/HomePage';
import { SpacePage } from './pages/SpacePage';
import { DocPage } from './pages/DocPage';
import { AccountPage } from './pages/AccountPage';
import { ImportPage } from './pages/ImportPage';
import { AssistantPage } from './pages/AssistantPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { DesignsPage } from './pages/DesignsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { GeneralSettings } from './pages/admin/GeneralSettings';
import { UsersAdmin } from './pages/admin/UsersAdmin';
import { AiSettings } from './pages/admin/AiSettings';
import { EmailSettings } from './pages/admin/EmailSettings';
import { IntegrationsSettings } from './pages/admin/IntegrationsSettings';

function FullScreenSpinner() {
  return (
    <div className="grid h-full place-items-center">
      <Spinner />
    </div>
  );
}

function RequireAuth() {
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get<{ needsSetup: boolean }>('/auth/setup-status') });
  const me = useMe();
  if (setup.isLoading || (me.isLoading && !setup.data?.needsSetup)) return <FullScreenSpinner />;
  if (setup.data?.needsSetup) return <Navigate to="/setup" replace />;
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;
  if (!me.data) return <FullScreenSpinner />;
  return <AppLayout me={me.data} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<HomePage />} />
        <Route path="s/:slug" element={<SpacePage />} />
        <Route path="s/:slug/p/:nodeId" element={<DocPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="designs" element={<DesignsPage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="users" element={<UsersAdmin />} />
          <Route path="ai" element={<AiSettings />} />
          <Route path="email" element={<EmailSettings />} />
          <Route path="integrations" element={<IntegrationsSettings />} />
        </Route>
        <Route path="admin/users" element={<Navigate to="/admin/users" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
