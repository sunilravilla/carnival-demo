import { useGuest } from '../../context/GuestContext';

const CATEGORY_CONFIG = [
  { key: 'Dining', color: '#B61B38', icon: '🍽' },
  { key: 'Spa',    color: '#6B7CFF', icon: '💆' },
  { key: 'Bar',    color: '#C8952A', icon: '🍹' },
  { key: 'Shop',   color: '#22c55e', icon: '🛍' },
  { key: 'Other',  color: '#999',    icon: '💳' },
];

const KEYWORDS = {
  Dining: ['dining', 'restaurant', 'cucina', 'fahrenheit', 'punchliner', 'brunch', 'dinner', 'lunch', 'food', 'meal', 'chops', 'gusto'],
  Spa:    ['spa', 'massage', 'facial', 'treatment', 'salon', 'beauty'],
  Bar:    ['bar', 'drink', 'cheers', 'alcohol', 'beverage', 'cocktail', 'wine', 'beer'],
  Shop:   ['shop', 'retail', 'souvenir', 'store', 'boutique', 'gift'],
};

function categorize(item) {
  const desc = item?.description || item?.desc || '';
  if (!desc) return 'Other';
  const d = desc.toLowerCase();
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (words.some(w => d.includes(w))) return cat;
  }
  return 'Other';
}

function buildCategories(items = []) {
  const totals = {};
  for (const item of items) {
    const cat = categorize(item);
    totals[cat] = (totals[cat] || 0) + (item.amount || 0);
  }
  return totals;
}

const S = {
  section: { margin: '12px 12px 0' },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: '1px solid #f0ece6',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontSize: 14, fontWeight: 700, color: '#1a1a2e' },
  balance: { fontSize: 28, fontWeight: 800, color: '#1a1a2e', lineHeight: 1 },
  balanceSub: { fontSize: 11, color: '#999', marginTop: 2 },
  barWrap: {
    display: 'flex', height: 8, borderRadius: 4,
    overflow: 'hidden', marginBottom: 10,
    background: '#f0ece6',
  },
  barSeg: (color, pct) => ({
    width: `${pct}%`, background: color,
    transition: 'width 0.5s ease',
    minWidth: pct > 0 ? 2 : 0,
  }),
  legend: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 14 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 },
  dot: (color) => ({
    width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
  }),
  legendLabel: { color: '#555' },
  legendAmt: { color: '#1a1a2e', fontWeight: 700 },
  divider: { border: 'none', borderTop: '1px solid #f0ece6', margin: '12px 0 10px' },
  txTitle: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  txRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 0',
  },
  txDesc: { fontSize: 13, color: '#444', flex: 1, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  txAmt: { fontSize: 13, fontWeight: 700, color: '#B61B38', flexShrink: 0 },
};

export default function FolioWidget() {
  const { folio } = useGuest();
  const { balance = 0, items = [] } = folio || {};

  const catTotals = buildCategories(items);
  const grandTotal = Object.values(catTotals).reduce((a, b) => a + b, 0) || 1;
  const recentItems = [...items].slice(-3).reverse();

  return (
    <div style={S.section}>
      <div style={S.card}>
        <div style={S.header}>
          <div>
            <div style={S.title}>Onboard Account</div>
            <div style={S.balanceSub}>Running total</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={S.balance}>${balance.toFixed(2)}</div>
          </div>
        </div>

        {/* Stacked category bar */}
        <div style={S.barWrap}>
          {CATEGORY_CONFIG.map(({ key, color }) => {
            const amt = catTotals[key] || 0;
            const pct = (amt / grandTotal) * 100;
            return pct > 0 ? <div key={key} style={S.barSeg(color, pct)} /> : null;
          })}
        </div>

        {/* Legend */}
        <div style={S.legend}>
          {CATEGORY_CONFIG.map(({ key, color, icon }) => {
            const amt = catTotals[key];
            if (!amt) return null;
            return (
              <div key={key} style={S.legendItem}>
                <div style={S.dot(color)} />
                <span style={S.legendLabel}>{icon} {key}</span>
                <span style={S.legendAmt}>${amt.toFixed(0)}</span>
              </div>
            );
          })}
        </div>

        {recentItems.length > 0 && (
          <>
            <hr style={S.divider} />
            <div style={S.txTitle}>Recent Charges</div>
            {recentItems.map((item, i) => (
              <div key={i} style={S.txRow}>
                <span style={S.txDesc}>{item.description || item.desc || 'Charge'}</span>
                <span style={S.txAmt}>+${(item.amount || 0).toFixed(2)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
