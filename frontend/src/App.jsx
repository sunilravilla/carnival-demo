import { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import AdminLogin from './components/admin/AdminLogin';
import AdminPanel from './components/admin/AdminPanel';
import LandingPage from './components/LandingPage';
import { validateAdminSession, isUserAuthenticated } from './services/api';
import { branding, isCarnival } from './styles/branding';
import './App.css';

// CopilotKit provider — only mounted when the Carnival demo is on AND the
// useCopilotKit toggle is true (default false). The provider can be safely
// imported on every load because it's tree-shakeable and only initializes
// when rendered.
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

function App() {
  // View state: 'landing' | 'chat' | 'admin-login' | 'admin'
  // Skip landing if user already authenticated this session
  const [view, setView] = useState(isUserAuthenticated() ? 'chat' : 'landing');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  const handleUserAuthenticated = () => {
    setView('chat');
  };

  const handleAdminFromLanding = async () => {
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

  const handleAdminClick = async () => {
    setIsCheckingAuth(true);
    try {
      const isValid = await validateAdminSession();
      if (isValid) {
        setView('admin');
      } else {
        setView('admin-login');
      }
    } catch {
      setView('admin-login');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLoginSuccess = () => {
    setView('admin');
  };

  const handleExitAdmin = () => {
    setView('chat');
  };

  return (
    <div className="App">
      {view === 'landing' && (
        <LandingPage
          onEnterUser={handleUserAuthenticated}
          onEnterAdmin={handleAdminFromLanding}
        />
      )}
      {view === 'chat' && (
        <MaybeCopilotKit>
          <ChatInterface onAdminClick={handleAdminClick} isCheckingAuth={isCheckingAuth} />
        </MaybeCopilotKit>
      )}
      {view === 'admin-login' && (
        <AdminLogin onLoginSuccess={handleLoginSuccess} onCancel={handleExitAdmin} />
      )}
      {view === 'admin' && <AdminPanel onExit={handleExitAdmin} />}
    </div>
  );
}

export default App;
