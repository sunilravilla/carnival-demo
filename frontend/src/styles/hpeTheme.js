// HPE Design System Color Palette
// Based on HPE Design System Guidelines

export const hpeTheme = {
  // Brand Colors
  brand: {
    green: '#01a982',
    greenDark: '#008567',
    greenLight: '#17eba0',
  },

  // Core Palette
  core: {
    purple: '#7630EA',
    teal: '#00e8cf',
    blue: '#00739d',
    red: '#c54e4b',
    orange: '#FF8300',
    yellow: '#fec901',
  },

  // Light Palette (for light theme)
  light: {
    green: '#17eba0',
    purple: '#f740ff',
    teal: '#82fff2',
    blue: '#00c8ff',
    red: '#fc6161',
    orange: '#ffbc44',
    yellow: '#ffeb59',
  },

  // Dark Palette (for dark theme)
  dark: {
    green: '#008567',
    purple: '#6633bc',
    teal: '#117b82',
    blue: '#00739d',
    red: '#a2423d',
    orange: '#9b6310',
    yellow: '#8d741c',
  },

  // Background Colors (Light Mode)
  background: {
    main: '#ffffff',
    back: '#f7f7f7',
    front: '#ffffff',
    contrast: 'rgba(0, 0, 0, 0.04)',
  },

  // Border Colors (Light Mode)
  border: {
    main: 'rgba(0, 0, 0, 0.36)',
    strong: 'rgba(0, 0, 0, 0.72)',
    weak: 'rgba(0, 0, 0, 0.12)',
  },

  // Text Colors (Light Mode)
  text: {
    main: '#555555',
    strong: '#2e2e2e',
    weak: '#676767',
    xweak: '#676767',
  },

  // Status Colors
  status: {
    critical: '#ec3331',
    warning: '#d36d00',
    ok: '#009a71',
    unknown: '#757575',
  },

  // Focus Color
  focus: '#004233',

  // Elevation (Box Shadows)
  elevation: {
    small: '0 2px 4px rgba(0, 0, 0, 0.12)',
    medium: '0px 6px 12px 0px rgba(0, 0, 0, 0.12)',
    large: '0px 12px 24px 0px rgba(0, 0, 0, 0.24)',
  },

  // Graph Colors
  graph: [
    '#3c3aa1',
    '#b0840d',
    '#a95589',
    '#2053d9',
    '#a78972',
    '#7022ec',
    '#38819c',
    '#470d69',
  ],

  // Gradients
  gradients: {
    primary: 'linear-gradient(135deg, #01a982 0%, #00739d 100%)',
    accent: 'linear-gradient(135deg, #7630EA 0%, #00e8cf 100%)',
    overlay: 'linear-gradient(180deg, rgba(1, 169, 130, 0.9) 0%, rgba(0, 115, 157, 0.9) 100%)',
  },

  // Typography
  typography: {
    fontFamily: "'Metric', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSizes: {
      xs: '12px',
      sm: '14px',
      md: '16px',
      lg: '18px',
      xl: '24px',
      xxl: '32px',
      xxxl: '48px',
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      bold: 700,
    },
  },

  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
    xxxl: '64px',
  },

  // Border Radius
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '16px',
    xl: '24px',
    round: '50%',
  },

  // Transitions
  transitions: {
    fast: '150ms ease-in-out',
    normal: '300ms ease-in-out',
    slow: '500ms ease-in-out',
  },

  // Admin Panel Theme (Futuristic Aesthetic)
  admin: {
    // Dark sidebar colors
    sidebar: {
      background: '#0d0d1a',
      backgroundHover: '#1a1a2e',
      backgroundActive: '#252547',
      text: '#e0e0e0',
      textMuted: '#8a8a9e',
      textActive: '#ffffff',
      border: 'rgba(118, 48, 234, 0.3)',
    },

    // Glass morphism effects
    glass: {
      background: 'rgba(255, 255, 255, 0.92)',
      backgroundDark: 'rgba(13, 13, 26, 0.95)',
      blur: 'blur(12px)',
      border: 'rgba(255, 255, 255, 0.18)',
    },

    // Glow effects for futuristic look
    glow: {
      green: '0 0 20px rgba(1, 169, 130, 0.4)',
      greenStrong: '0 0 30px rgba(1, 169, 130, 0.6)',
      purple: '0 0 20px rgba(118, 48, 234, 0.4)',
      purpleStrong: '0 0 30px rgba(118, 48, 234, 0.6)',
      teal: '0 0 20px rgba(0, 232, 207, 0.4)',
      tealStrong: '0 0 30px rgba(0, 232, 207, 0.6)',
    },

    // Gradient borders for futuristic panels
    gradientBorder: 'linear-gradient(135deg, #7630EA 0%, #00e8cf 50%, #01a982 100%)',
    gradientBorderHover: 'linear-gradient(135deg, #01a982 0%, #00e8cf 50%, #7630EA 100%)',

    // Card styles
    card: {
      background: 'rgba(255, 255, 255, 0.95)',
      backgroundHover: 'rgba(255, 255, 255, 1)',
      border: 'rgba(0, 0, 0, 0.08)',
      shadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
      shadowHover: '0 8px 32px rgba(1, 169, 130, 0.15)',
    },

    // Input styles
    input: {
      background: 'rgba(247, 247, 247, 0.8)',
      backgroundFocus: '#ffffff',
      border: 'rgba(0, 0, 0, 0.12)',
      borderFocus: '#01a982',
      placeholder: '#999999',
    },

    // Button variants
    button: {
      primary: {
        background: 'linear-gradient(135deg, #01a982 0%, #008567 100%)',
        backgroundHover: 'linear-gradient(135deg, #17eba0 0%, #01a982 100%)',
        text: '#ffffff',
        shadow: '0 4px 16px rgba(1, 169, 130, 0.3)',
        shadowHover: '0 6px 24px rgba(1, 169, 130, 0.5)',
      },
      secondary: {
        background: 'transparent',
        backgroundHover: 'rgba(1, 169, 130, 0.08)',
        text: '#01a982',
        border: '#01a982',
      },
      danger: {
        background: 'linear-gradient(135deg, #c54e4b 0%, #a2423d 100%)',
        backgroundHover: 'linear-gradient(135deg, #fc6161 0%, #c54e4b 100%)',
        text: '#ffffff',
        shadow: '0 4px 16px rgba(197, 78, 75, 0.3)',
      },
    },

    // Status colors
    status: {
      success: '#01a982',
      warning: '#FF8300',
      error: '#c54e4b',
      info: '#00739d',
    },

    // Table styles
    table: {
      headerBackground: 'rgba(247, 247, 247, 0.9)',
      rowHover: 'rgba(1, 169, 130, 0.05)',
      border: 'rgba(0, 0, 0, 0.06)',
    },
  },
};

export default hpeTheme;
