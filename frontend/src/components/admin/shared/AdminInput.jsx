import React from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';

/**
 * Futuristic input component with focus glow
 * @param {Object} props
 * @param {string} props.label - Input label
 * @param {string} props.type - Input type (text, password, email)
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.multiline - Use textarea instead of input
 * @param {number} props.rows - Number of rows for textarea
 * @param {number} props.maxLength - Maximum character length
 * @param {boolean} props.showCount - Show character counter
 * @param {string} props.error - Error message
 */
function AdminInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  maxLength,
  showCount = false,
  error,
  disabled = false,
  style = {},
  ...props
}) {
  const [isFocused, setIsFocused] = React.useState(false);

  const inputStyle = {
    width: '100%',
    padding: hpeTheme.spacing.md,
    fontSize: hpeTheme.typography.fontSizes.md,
    fontFamily: hpeTheme.typography.fontFamily,
    color: hpeTheme.text.strong,
    background: isFocused
      ? hpeTheme.admin.input.backgroundFocus
      : hpeTheme.admin.input.background,
    border: `1px solid ${
      error
        ? hpeTheme.status.critical
        : isFocused
          ? hpeTheme.admin.input.borderFocus
          : hpeTheme.admin.input.border
    }`,
    borderRadius: hpeTheme.borderRadius.md,
    outline: 'none',
    transition: `all ${hpeTheme.transitions.fast}`,
    boxShadow: isFocused ? hpeTheme.admin.glow.green : 'none',
    resize: multiline ? 'vertical' : 'none',
    opacity: disabled ? 0.6 : 1,
    ...style,
  };

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}
      <InputComponent
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        maxLength={maxLength}
        disabled={disabled}
        style={inputStyle}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      <div style={styles.footer}>
        {error && <span style={styles.error}>{error}</span>}
        {showCount && maxLength && (
          <span style={styles.counter}>
            {value?.length || 0}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: hpeTheme.spacing.xs,
    width: '100%',
  },
  label: {
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontWeight: hpeTheme.typography.fontWeights.medium,
    color: hpeTheme.text.main,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '20px',
  },
  error: {
    fontSize: hpeTheme.typography.fontSizes.xs,
    color: hpeTheme.status.critical,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  counter: {
    fontSize: hpeTheme.typography.fontSizes.xs,
    color: hpeTheme.text.weak,
    fontFamily: hpeTheme.typography.fontFamily,
    marginLeft: 'auto',
  },
};

export default AdminInput;
