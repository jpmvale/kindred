import { NavLink } from 'react-router-dom';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

const W = { expanded: 220, collapsed: 64 };

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="5" rx="1"/>
      <rect x="1" y="15" width="8" height="5" rx="1"/>
      <rect x="15" y="15" width="8" height="5" rx="1"/>
      <line x1="12" y1="7" x2="12" y2="12"/>
      <line x1="12" y1="12" x2="5" y2="12"/>
      <line x1="12" y1="12" x2="19" y2="12"/>
      <line x1="5" y1="12" x2="5" y2="15"/>
      <line x1="19" y1="12" x2="19" y2="15"/>
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/people',    label: 'Pessoas', Icon: PeopleIcon },
  { to: '/calendar',  label: 'Calendário', Icon: CalendarIcon },
  { to: '/tree',      label: 'Árvore',  Icon: TreeIcon },
  { to: '/locations', label: 'Locais',  Icon: LocationIcon },
];

export default function Sidebar({ collapsed, onToggle }: Props) {
  const w = collapsed ? W.collapsed : W.expanded;

  return (
    <aside
      style={{
        width: w,
        minWidth: w,
        height: '100vh',
        background: '#fff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.22s ease, min-width 0.22s ease',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? 0 : '0 0.875rem',
          borderBottom: '1px solid #f3f4f6',
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', letterSpacing: '-0.02em' }}>
            Kindred
          </span>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir' : 'Recolher'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.375rem',
            borderRadius: '0.375rem',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#374151')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ padding: '0.5rem', flex: 1 }}>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: collapsed ? '0.625rem' : '0.625rem 0.75rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: '0.5rem',
              marginBottom: '0.2rem',
              textDecoration: 'none',
              color: isActive ? '#6366f1' : '#4b5563',
              background: isActive ? '#eef2ff' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: '0.875rem',
              transition: 'background 0.15s, color 0.15s',
            })}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (!el.style.background.includes('eef2ff')) el.style.background = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (!el.style.background.includes('eef2ff')) el.style.background = 'transparent';
            }}
          >
            <Icon />
            {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
