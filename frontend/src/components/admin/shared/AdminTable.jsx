import React from 'react';
import { hpeTheme } from '../../../styles/hpeTheme';

/**
 * Data table with futuristic styling
 * @param {Object} props
 * @param {Array} props.columns - Column definitions [{key, label, width, render}]
 * @param {Array} props.data - Row data
 * @param {Function} props.onRowClick - Row click handler
 * @param {string} props.emptyMessage - Message when no data
 * @param {boolean} props.loading - Show loading state
 */
function AdminTable({
  columns = [],
  data = [],
  onRowClick,
  emptyMessage = 'No data available',
  loading = false,
  rowKey = 'id',
}) {
  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <span>Loading...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>&#128196;</span>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          <tr style={styles.headerRow}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ ...styles.headerCell, width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={row[rowKey] || index}
              style={styles.row}
              onClick={() => onRowClick && onRowClick(row)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = hpeTheme.admin.table.rowHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {columns.map((col) => (
                <td key={col.key} style={styles.cell}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    overflowX: 'auto',
    borderRadius: hpeTheme.borderRadius.md,
    border: `1px solid ${hpeTheme.admin.table.border}`,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: hpeTheme.typography.fontFamily,
  },
  headerRow: {
    background: hpeTheme.admin.table.headerBackground,
  },
  headerCell: {
    padding: hpeTheme.spacing.md,
    textAlign: 'left',
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontWeight: hpeTheme.typography.fontWeights.bold,
    color: hpeTheme.text.strong,
    borderBottom: `1px solid ${hpeTheme.admin.table.border}`,
    whiteSpace: 'nowrap',
  },
  row: {
    cursor: 'pointer',
    transition: `background ${hpeTheme.transitions.fast}`,
    borderBottom: `1px solid ${hpeTheme.admin.table.border}`,
  },
  cell: {
    padding: hpeTheme.spacing.md,
    fontSize: hpeTheme.typography.fontSizes.sm,
    color: hpeTheme.text.main,
    verticalAlign: 'middle',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: hpeTheme.spacing.xxl,
    gap: hpeTheme.spacing.md,
    color: hpeTheme.text.weak,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: `3px solid ${hpeTheme.border.weak}`,
    borderTopColor: hpeTheme.brand.green,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: hpeTheme.spacing.xxl,
    gap: hpeTheme.spacing.sm,
    color: hpeTheme.text.weak,
    fontSize: hpeTheme.typography.fontSizes.sm,
    fontFamily: hpeTheme.typography.fontFamily,
  },
  emptyIcon: {
    fontSize: '48px',
    opacity: 0.5,
  },
};

export default AdminTable;
