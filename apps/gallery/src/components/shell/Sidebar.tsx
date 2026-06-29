import { NavLink } from 'react-router-dom';
import { NAV } from '../../nav';

function linkClass({ isActive }: { isActive: boolean }): string {
  return `block rounded-lg px-3 py-1.5 text-sm transition-colors ${
    isActive
      ? 'bg-accent-soft font-semibold text-accent'
      : 'text-muted hover:bg-surface-2 hover:text-text'
  }`;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6 p-4" aria-label="Gallery sections">
      {NAV.map((section) => (
        <div key={section.id}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            {section.title}
          </div>
          {section.kind === 'charts' ? (
            <NavLink to="/charts" className={linkClass} onClick={onNavigate} end>
              Browse Chart Catalog
            </NavLink>
          ) : (
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate} end>
                  <span className="flex items-center justify-between">
                    {item.label}
                    {item.badge && (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                        {item.badge}
                      </span>
                    )}
                  </span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
