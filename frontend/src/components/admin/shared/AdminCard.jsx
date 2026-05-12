import React from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';

/**
 * Glass morphism card container with futuristic styling
 * @param {Object} props
 * @param {string} props.title - Optional card title
 * @param {React.ReactNode} props.children - Card content
 * @param {Object} props.style - Additional styles
 * @param {boolean} props.hoverable - Enable hover effects
 */
function AdminCard({
  title,
  children,
  style = {},
  hoverable = false,
  headerAction,
  ...props
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  const cardStyle = {
    background: isHovered && hoverable
      ? hpeTheme.admin.card.backgroundHover
      : hpeTheme.admin.card.background,
    borderRadius: hpeTheme.borderRadius.lg,
    border: `1px solid ${hpeTheme.admin.card.border}`,
    boxShadow: isHovered && hoverable
      ? hpeTheme.admin.card.shadowHover
      : hpeTheme.admin.card.shadow,
    padding: hpeTheme.spacing.lg,
    transition: `all ${hpeTheme.transitions.normal}`,
    backdropFilter: hpeTheme.admin.glass.blur,
    ...style,
  };

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {title && (
        <div style={styles.header}>
          <h3 style={styles.title}>{title}</h3>
          {headerAction && <div style={styles.headerAction}>{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hpeTheme.spacing.md,
    paddingBottom: hpeTheme.spacing.md,
    borderBottom: `1px solid ${hpeTheme.border.weak}`,
  },
  title: {
    margin: 0,
    fontSize: hpeTheme.typography.fontSizes.lg,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.text.strong,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  headerAction: {
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.sm,
  },
};

export default AdminCard;
