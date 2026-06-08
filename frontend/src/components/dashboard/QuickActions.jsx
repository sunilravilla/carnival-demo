import { useGuest } from '../../context/GuestContext';
import { isVirgin, isMarenova } from '../../styles/branding';

const CARNIVAL_ACTIONS = [
  { id: 'dining',     icon: '🍽', label: 'Book Dining',    msg: 'I want to book a restaurant for dinner tonight',  always: true },
  { id: 'show',       icon: '🎭', label: 'Find a Show',    msg: 'What shows are playing tonight?',                  always: true },
  { id: 'spa',        icon: '💆', label: 'Book Spa',        msg: 'I would like to book a spa treatment',            always: true },
  { id: 'excursion',  icon: '🏖', label: 'Shore Excursions', msg: 'What shore excursions are available?',           portOnly: true },
  { id: 'drinks',     icon: '🍹', label: 'CHEERS! Package', msg: 'Tell me about the CHEERS! drink package',        seaOnly: true },
  { id: 'activities', icon: '🎯', label: 'Onboard Activities', msg: 'What activities are happening on the ship today?', always: true },
  { id: 'folio',      icon: '💳', label: 'My Account',     msg: 'What have I spent so far?',                       always: true },
];

const VIRGIN_ACTIONS = [
  { id: 'dining',     icon: '🍽',  label: 'Book Dining',     msg: 'Book me a restaurant for tonight',                                always: true },
  { id: 'show',       icon: '🎭',  label: 'Find a Show',     msg: 'What shows are playing tonight at The Red Room and The Manor?',  always: true },
  { id: 'recovery',   icon: '🥴',  label: 'Recovery menu',   msg: 'Open the hangover recovery menu',                                 always: true },
  { id: 'drink',      icon: '🍸',  label: 'What to drink?',  msg: 'What should I drink right now? Pick the mood — I trust you.',     always: true },
  { id: 'surprise',   icon: '🎁',  label: 'Surprise mode',   msg: 'Arrange a surprise for tonight — anniversary, premium budget',    always: true },
  { id: 'packing',    icon: '🎒',  label: 'Packing list',    msg: 'Generate my packing list for Scarlet Night and Bimini',            always: true },
  { id: 'bimini',     icon: '🏝',  label: 'Pre-board Bimini',msg: 'Pre-board my Bimini day — cabana, lunch, sunset cocktail',         always: true },
  { id: 'squad',      icon: '👥',  label: 'Squad night',     msg: 'Create a Scarlet Night squad event for 4 of us',                  always: true },
  { id: 'diary',      icon: '📔',  label: "Today's diary",   msg: "Show me today's voyage diary",                                     always: true },
  { id: 'folio',      icon: '💳',  label: 'My Account',      msg: 'What have I spent so far?',                                        always: true },
];

const MARENOVA_ACTIONS = [
  { id: 'dining',     icon: '🍽',  label: 'Book Dining',     msg: 'Book me a restaurant for tonight',                                          always: true },
  { id: 'show',       icon: '🎭',  label: 'Find a Show',     msg: 'What shows are playing tonight at the Aurora Theater and Starlight Lounge?', always: true },
  { id: 'recovery',   icon: '🌅',  label: 'Morning reset',   msg: 'Open the Morning Reset menu',                                               always: true },
  { id: 'drink',      icon: '🥤',  label: 'What to sip?',    msg: 'What should I sip right now? Pick the mood — I trust you.',                  always: true },
  { id: 'surprise',   icon: '🎁',  label: 'Surprise mode',   msg: 'Arrange a celebration for tonight — anniversary',                           always: true },
  { id: 'packing',    icon: '🎒',  label: 'Packing list',    msg: 'Generate my packing list for the Starlight Deck Party and Aurora Cay',      always: true },
  { id: 'island',     icon: '🏝',  label: 'Pre-board Aurora Cay', msg: 'Pre-board my Aurora Cay day — cabana, lunch, sunset ice-cream social',  always: true },
  { id: 'squad',      icon: '👥',  label: 'Group night',     msg: 'Create a Starlight Deck Party group event for 4 of us',                     always: true },
  { id: 'diary',      icon: '📔',  label: "Today's diary",   msg: "Show me today's voyage diary",                                              always: true },
  { id: 'folio',      icon: '💳',  label: 'My Account',      msg: 'What have I spent so far?',                                                 always: true },
];

const ALL_ACTIONS = isMarenova ? MARENOVA_ACTIONS : isVirgin ? VIRGIN_ACTIONS : CARNIVAL_ACTIONS;

const S = {
  section: { margin: '12px 12px 0' },
  title: { fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 8,
  },
  chip: {
    background: '#fff',
    border: '1px solid #e5e0d8',
    borderRadius: 14,
    padding: '12px 8px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
  chipIcon: { fontSize: 24 },
  chipLabel: { fontSize: 11, fontWeight: 600, color: '#444', textAlign: 'center', lineHeight: 1.2 },
};

export default function QuickActions({ onAction }) {
  const { guestData } = useGuest();

  const isPortDay = guestData?.cruise?.todayLabel &&
    guestData.cruise.todayLabel !== 'At Sea';

  const actions = ALL_ACTIONS.filter(a => {
    if (a.always) return true;
    if (a.portOnly && isPortDay) return true;
    if (a.seaOnly && !isPortDay) return true;
    return false;
  });

  const handleClick = (action, el) => {
    el.style.transform = 'scale(0.94)';
    el.style.boxShadow = 'none';
    el.style.borderColor = '#B61B38';
    setTimeout(() => {
      el.style.transform = '';
      el.style.boxShadow = '';
      el.style.borderColor = '';
    }, 200);
    onAction?.(action.msg);
  };

  return (
    <div style={S.section}>
      <div style={S.title}>Quick Actions</div>
      <div style={S.grid}>
        {actions.map(action => (
          <div
            key={action.id}
            style={S.chip}
            onClick={(e) => handleClick(action, e.currentTarget)}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#B61B38';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = '';
            }}
          >
            <span style={S.chipIcon}>{action.icon}</span>
            <span style={S.chipLabel}>{action.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
