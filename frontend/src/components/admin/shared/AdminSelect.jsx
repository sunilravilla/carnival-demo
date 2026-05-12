import React, { useState, useRef, useEffect } from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';

/**
 * Futuristic select/dropdown component
 * @param {Object} props
 * @param {string} props.label - Select label
 * @param {Array} props.options - Array of {value, label} objects
 * @param {string|Array} props.value - Selected value(s)
 * @param {Function} props.onChange - Change handler
 * @param {boolean} props.multiple - Allow multiple selection
 * @param {string} props.placeholder - Placeholder text
 */
function AdminSelect({
  label,
  options = [],
  value,
  onChange,
  multiple = false,
  placeholder = 'Select an option',
  disabled = false,
  style = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (optValue) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(optValue)) {
        onChange(currentValues.filter((v) => v !== optValue));
      } else {
        onChange([...currentValues, optValue]);
      }
    } else {
      onChange(optValue);
      setIsOpen(false);
    }
  };

  const getDisplayValue = () => {
    if (multiple) {
      const selectedValues = Array.isArray(value) ? value : [];
      if (selectedValues.length === 0) return placeholder;
      if (selectedValues.length === 1) {
        const opt = options.find((o) => o.value === selectedValues[0]);
        return opt?.label || selectedValues[0];
      }
      return `${selectedValues.length} selected`;
    } else {
      const opt = options.find((o) => o.value === value);
      return opt?.label || placeholder;
    }
  };

  const isSelected = (optValue) => {
    if (multiple) {
      return Array.isArray(value) && value.includes(optValue);
    }
    return value === optValue;
  };

  return (
    <div style={styles.container} ref={containerRef}>
      {label && <label style={styles.label}>{label}</label>}
      <div
        style={{
          ...styles.selectBox,
          ...(isOpen ? styles.selectBoxOpen : {}),
          ...(disabled ? styles.disabled : {}),
          ...style,
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span style={value ? styles.value : styles.placeholder}>
          {getDisplayValue()}
        </span>
        <span style={styles.arrow}>{isOpen ? '\u25B2' : '\u25BC'}</span>
      </div>

      {isOpen && (
        <div style={styles.dropdown}>
          {options.length > 5 && (
            <input
              type="text"
              style={styles.search}
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div style={styles.optionsList}>
            {filteredOptions.map((opt) => (
              <div
                key={opt.value}
                style={{
                  ...styles.option,
                  ...(isSelected(opt.value) ? styles.optionSelected : {}),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.value);
                }}
              >
                {multiple && (
                  <span style={styles.checkbox}>
                    {isSelected(opt.value) ? '\u2713' : ''}
                  </span>
                )}
                {opt.label}
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div style={styles.noOptions}>No options found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: hpeTheme.spacing.xs,
    width: '100%',
    position: 'relative',
  },
  label: {
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontWeight: hpeTheme.typography.fontWeights.medium,
    color: hpeTheme.text.main,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  selectBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: hpeTheme.spacing.md,
    background: hpeTheme.admin.input.background,
    border: `1px solid ${hpeTheme.admin.input.border}`,
    borderRadius: hpeTheme.borderRadius.md,
    cursor: 'pointer',
    transition: `all ${hpeTheme.transitions.fast}`,
    minHeight: '44px',
  },
  selectBoxOpen: {
    borderColor: hpeTheme.admin.input.borderFocus,
    boxShadow: hpeTheme.admin.glow.green,
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  value: {
    fontSize: hpeTheme.typography.fontSizes.md,
    color: hpeTheme.text.strong,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  placeholder: {
    fontSize: hpeTheme.typography.fontSizes.md,
    color: hpeTheme.admin.input.placeholder,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  arrow: {
    fontSize: hpeTheme.typography.fontSizes.xs,
    color: hpeTheme.text.weak,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: hpeTheme.spacing.xs,
    background: '#ffffff',
    border: `1px solid ${hpeTheme.admin.input.border}`,
    borderRadius: hpeTheme.borderRadius.md,
    boxShadow: hpeTheme.elevation.large,
    zIndex: 1000,
    maxHeight: '300px',
    overflow: 'hidden',
  },
  search: {
    width: '100%',
    padding: hpeTheme.spacing.sm,
    border: 'none',
    borderBottom: `1px solid ${hpeTheme.border.weak}`,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
    outline: 'none',
  },
  optionsList: {
    maxHeight: '240px',
    overflowY: 'auto',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: hpeTheme.spacing.sm,
    padding: hpeTheme.spacing.sm,
    fontSize: hpeTheme.typography.fontSizes.md,
    color: hpeTheme.text.main,
    fontFamily: hpeTheme.typography.fontFamily,
    cursor: 'pointer',
    transition: `background ${hpeTheme.transitions.fast}`,
  },
  optionSelected: {
    background: 'rgba(1, 169, 130, 0.1)',
    color: hpeTheme.brand.green,
  },
  checkbox: {
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${hpeTheme.border.main}`,
    borderRadius: hpeTheme.borderRadius.sm,
    fontSize: hpeTheme.typography.fontSizes.xs,
    color: hpeTheme.brand.green,
  },
  noOptions: {
    padding: hpeTheme.spacing.md,
    textAlign: 'center',
    color: hpeTheme.text.weak,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
  },
};

export default AdminSelect;
