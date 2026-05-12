import { useState, useEffect } from 'react';
import AdminLogin from './components/admin/AdminLogin';
import AdminPanel from './components/admin/AdminPanel';
import WelcomeScreen from './components/WelcomeScreen';
import GuestLookupScreen from './components/GuestLookupScreen';
import DashboardPage from './components/dashboard/DashboardPage';
import AccessGate, { isAccessGranted, grantAccess } from './components/AccessGate';
import { validateAdminSession, getStoredGuestPhone, lookupGuest } from './services/api';
import { GuestProvider, useGuest } from './context/GuestContext';
import { branding, isCarnival } from './styles/branding';
import './App.css';

import { CopilotKit } from '@copilotkit/react-core';
import '@copilotkit/react-ui/styles.css';

function MaybeCopilotKit({ children }) {
  if (isCarnival && branding.useCopilotKit) {
    return (
      <CopilotKit runtimeUrl="/api/copilotkit" agent="marina">
        {children}
      </CopilotKit>
    );
  }
  return children;
}

// Views: 'access' | 'welcome' | 'lookup' | 'dashboard' | 'admin-login' | 'admin'
function resolveInitialView() {
  if (!isAccessGranted()) return 'access';
  // URL param fast-path for QR codes: ?phone=9999999990
  const params = new URLSearchParams(window.location.search);
  if (params.get('phone')) return 'qr-loading';
  // Session restore
  if (getStoredGuestPhone()) return 'dashboard-loading';
  return 'welcome';
}

function AppInner() {
  const { loadGuest, clearGuest } = useGuest();
  const [view, setView] = useState(resolveInitialView);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  // Handle QR-code URL param and session restore on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get('phone');

    if (phoneParam) {
      // Remove phone from URL without reload
      window.history.replaceState({}, '', window.location.pathname);
      lookupGuest(phoneParam)
        .then((data) => { loadGuest(data.guest); setView('dashboard'); })
        .catch(() => setView('welcome'));
      return;
    }

    const storedPhone = getStoredGuestPhone();
    if (storedPhone) {
      lookupGuest(storedPhone)
        .then((data) => { loadGuest(data.guest); setView('dashboard'); })
        .catch(() => { setView('welcome'); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGuestFound = (guestData) => {
    loadGuest(guestData);
    setView('dashboard');
  };

  const handleAdminClick = async () => {
    setIsCheckingAuth(true);
    try {
      const isValid = await validateAdminSession();
      setView(isValid ? 'admin' : 'admin-login');
    } catch {
      setView('admin-login');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLoginSuccess = () => setView('admin');

  const handleExitAdmin = () => setView('dashboard');

  const handleSwitchGuest = async () => {
    await clearGuest();
    setView('welcome');
  };

  // Show blank while resolving QR / session
  if (view === 'qr-loading' || view === 'dashboard-loading') {
    return (
      <div style={{ background: '#006994', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: 18, opacity: 0.8 }}>Finding your voyage…</div>
      </div>
    );
  }

  return (
    <div className="App">
      {view === 'access' && (
        <AccessGate onGranted={() => setView('welcome')} />
      )}
      {view === 'welcome' && (
        <WelcomeScreen onGetStarted={() => setView('lookup')} />
      )}
      {view === 'lookup' && (
        <GuestLookupScreen onGuestFound={handleGuestFound} />
      )}
      {view === 'dashboard' && (
        <MaybeCopilotKit>
          <DashboardPage
            onAdminClick={handleAdminClick}
            onSwitchGuest={handleSwitchGuest}
            isCheckingAuth={isCheckingAuth}
          />
        </MaybeCopilotKit>
      )}
      {view === 'admin-login' && (
        <AdminLogin onLoginSuccess={handleLoginSuccess} onCancel={handleExitAdmin} />
      )}
      {view === 'admin' && <AdminPanel onExit={handleExitAdmin} />}
    </div>
  );
}

function App() {
  return (
    <GuestProvider>
      <AppInner />
    </GuestProvider>
  );
}

export default App;
