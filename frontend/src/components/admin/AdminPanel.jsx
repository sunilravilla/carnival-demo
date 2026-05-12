import React, { useState, useEffect } from 'react';
import { hpeTheme } from '../../styles/hpeTheme';
import AdminSidebar from './AdminSidebar';
import ModelSettings from './pages/ModelSettings';
import RagSettings from './pages/RagSettings';
import ContentManager from './pages/ContentManager';
import { adminLogout } from '../../services/api';

function AdminPanel({ onExit }) {
  const [activePage, setActivePage] = useState('model');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleLogout = async () => {
    await adminLogout();
    onExit();
  };

  const renderPage = () => {
    switch (activePage) {
      case 'model':
        return <ModelSettings />;
      case 'rag':
        return <RagSettings />;
      case 'content':
        return <ContentManager />;
      default:
        return <ModelSettings />;
    }
  };

  const getPageTitle = () => {
    switch (activePage) {
      case 'model':
        return 'Model Settings';
      case 'rag':
        return 'RAG Settings';
      case 'content':
        return 'Content Manager';
      default:
        return 'Admin';
    }
  };

  return (
    <div style={{ ...styles.container, flexDirection: isMobile ? 'column' : 'row' }}>
      <AdminSidebar
        activePage={activePage}
        onPageChange={setActivePage}
        onLogout={handleLogout}
        isMobile={isMobile}
        onExit={onExit}
      />

      <div style={styles.main}>
        {/* Desktop-only header (mobile has it in the top nav bar) */}
        {!isMobile && (
          <header style={styles.header}>
            <h1 style={styles.pageTitle}>{getPageTitle()}</h1>
            <button
              style={styles.exitButton}
              onClick={onExit}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(1, 169, 130, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Exit to Chat</span>
            </button>
          </header>
        )}

        {/* Content */}
        <main style={{ ...styles.content, padding: isMobile ? '16px' : hpeTheme.spacing.xl }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    height: '100dvh',
    background: hpeTheme.background.back,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${hpeTheme.spacing.md} ${hpeTheme.spacing.xl}`,
    background: '#ffffff',
    borderBottom: `1px solid ${hpeTheme.border.weak}`,
  },
  pageTitle: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.xl,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.text.strong,
  },
  exitButton: {
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.sm,
    padding: `${hpeTheme.spacing.sm} ${hpeTheme.spacing.md}`,
    background: 'transparent',
    border: `1px solid ${hpeTheme.brand.green}`,
    borderRadius: hpeTheme.borderRadius.md,
    color: hpeTheme.brand.green,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
    fontWeight: hpeTheme.typography.fontWeights.medium,
    cursor: 'pointer',
    transition: `all ${hpeTheme.transitions.fast}`,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
  },
};

export default AdminPanel;
