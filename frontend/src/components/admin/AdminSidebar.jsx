import React from 'react';
import { hpeTheme } from '../../styles/hpeTheme';

/**
 * Admin sidebar navigation with futuristic dark theme
 * @param {Object} props
 * @param {string} props.activePage - Current active page
 * @param {Function} props.onPageChange - Page change handler
 * @param {Function} props.onLogout - Logout handler
 */
function AdminSidebar({ activePage, onPageChange, onLogout, isMobile = false, onExit }) {
  const navItems = [
    {
      id: 'model',
      label: 'Model Settings',
      shortLabel: 'Model',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m15.5-6.5l-4.24 4.24m-2.52 2.52L5.5 18.5m13-1l-4.24-4.24m-2.52-2.52L5.5 5.5" />
        </svg>
      ),
    },
    {
      id: 'rag',
      label: 'RAG Settings',
      shortLabel: 'RAG',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
          <polyline points="7.5 19.79 7.5 14.6 3 12" />
          <polyline points="21 12 16.5 14.6 16.5 19.79" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      id: 'content',
      label: 'Content Manager',
      shortLabel: 'Content',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
  ];

  const Logo = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke={hpeTheme.brand.green} strokeWidth="2" />
      <path d="M2 17L12 22L22 17" stroke={hpeTheme.core.teal} strokeWidth="2" />
      <path d="M2 12L12 17L22 12" stroke={hpeTheme.core.purple} strokeWidth="2" />
    </svg>
  );

  // ── Mobile: horizontal top bar ────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={styles.topBar}>
        {/* Brand */}
        <div style={styles.topBrand}>
          <Logo />
          <span style={styles.topBrandTitle}>Marina</span>
        </div>

        {/* Nav tabs */}
        <div style={styles.topNav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              style={{
                ...styles.topNavItem,
                ...(activePage === item.id ? styles.topNavItemActive : {}),
              }}
              onClick={() => onPageChange(item.id)}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={styles.topNavLabel}>{item.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Exit */}
        <button style={styles.topExit} onClick={onExit}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Desktop: vertical sidebar ─────────────────────────────────────────────
  return (
    <div style={styles.sidebar}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoBox}><Logo /></div>
        <div style={styles.headerText}>
          <span style={styles.headerTitle}>Marina</span>
          <span style={styles.headerSubtitle}>Concierge Admin</span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={styles.nav}>
        {navItems.map((item) => (
          <button
            key={item.id}
            style={{ ...styles.navItem, ...(activePage === item.id ? styles.navItemActive : {}) }}
            onClick={() => onPageChange(item.id)}
            onMouseEnter={(e) => { if (activePage !== item.id) e.currentTarget.style.background = hpeTheme.admin.sidebar.backgroundHover; }}
            onMouseLeave={(e) => { if (activePage !== item.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={styles.navIcon}>{item.icon}</span>
            <span style={styles.navLabel}>{item.label}</span>
            {activePage === item.id && <span style={styles.activeIndicator} />}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={styles.footer}>
        <button
          style={styles.logoutButton}
          onClick={onLogout}
          onMouseEnter={(e) => { e.currentTarget.style.background = hpeTheme.admin.sidebar.backgroundHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

const styles = {
  // ── Mobile top bar ──────────────────────────────────────────────────────
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 8px',
    height: '56px',
    background: hpeTheme.admin.sidebar.background,
    borderBottom: `1px solid ${hpeTheme.admin.sidebar.border}`,
    flexShrink: 0,
  },
  topBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingRight: '8px',
    borderRight: `1px solid ${hpeTheme.admin.sidebar.border}`,
    marginRight: '4px',
  },
  topBrandTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: hpeTheme.admin.sidebar.textActive,
    whiteSpace: 'nowrap',
  },
  topNav: {
    display: 'flex',
    flex: 1,
    gap: '2px',
  },
  topNavItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: '6px 4px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: hpeTheme.admin.sidebar.text,
    fontSize: '10px',
    fontFamily: hpeTheme.typography.fontFamily,
    cursor: 'pointer',
  },
  topNavItemActive: {
    background: hpeTheme.admin.sidebar.backgroundActive,
    color: hpeTheme.admin.sidebar.textActive,
  },
  topNavLabel: {
    fontSize: '10px',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  topExit: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'transparent',
    border: `1px solid ${hpeTheme.brand.green}`,
    borderRadius: '6px',
    color: hpeTheme.brand.green,
    cursor: 'pointer',
    flexShrink: 0,
  },
  // ── Desktop sidebar ─────────────────────────────────────────────────────
  sidebar: {
    width: '260px',
    height: '100vh',
    background: hpeTheme.admin.sidebar.background,
    borderRight: `1px solid ${hpeTheme.admin.sidebar.border}`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: hpeTheme.typography.fontFamily,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.md,
    padding: hpeTheme.spacing.lg,
    borderBottom: `1px solid ${hpeTheme.admin.sidebar.border}`,
  },
  logoBox: {
    width: '40px',
    height: '40px',
    borderRadius: hpeTheme.borderRadius.md,
    background: 'rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
  },
  headerTitle: {
    fontSize: hpeTheme.typography.fontSizes.lg,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.admin.sidebar.textActive,
  },
  headerSubtitle: {
    fontSize: hpeTheme.typography.fontSizes.xs,
    color: hpeTheme.admin.sidebar.textMuted,
  },
  nav: {
    flex: 1,
    padding: hpeTheme.spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: hpeTheme.spacing.xs,
  },
  navItem: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.md,
    padding: `${hpeTheme.spacing.sm} ${hpeTheme.spacing.md}`,
    background: 'transparent',
    border: 'none',
    borderRadius: hpeTheme.borderRadius.md,
    color: hpeTheme.admin.sidebar.text,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
    cursor: 'pointer',
    transition: `all ${hpeTheme.transitions.fast}`,
    textAlign: 'left',
  },
  navItemActive: {
    background: hpeTheme.admin.sidebar.backgroundActive,
    color: hpeTheme.admin.sidebar.textActive,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
  },
  navLabel: {
    flex: 1,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '3px',
    height: '60%',
    background: hpeTheme.brand.green,
    borderRadius: '0 2px 2px 0',
    boxShadow: hpeTheme.admin.glow.green,
  },
  footer: {
    padding: hpeTheme.spacing.md,
    borderTop: `1px solid ${hpeTheme.admin.sidebar.border}`,
  },
  logoutButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.md,
    padding: `${hpeTheme.spacing.sm} ${hpeTheme.spacing.md}`,
    background: 'transparent',
    border: 'none',
    borderRadius: hpeTheme.borderRadius.md,
    color: hpeTheme.admin.sidebar.text,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
    cursor: 'pointer',
    transition: `all ${hpeTheme.transitions.fast}`,
  },
};

export default AdminSidebar;
