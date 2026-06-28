import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Spinner } from '../ui/primitives';

export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const paletteReturnRef = useRef<HTMLElement | null>(null);
  const location = useLocation();

  const openSearch = useCallback(() => {
    const active = document.activeElement;
    paletteReturnRef.current =
      active instanceof HTMLElement ? active : searchButtonRef.current;
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    window.setTimeout(() => {
      const target = paletteReturnRef.current ?? searchButtonRef.current;
      if (target?.isConnected) target.focus();
    }, 0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchOpen) {
          closeSearch();
        } else {
          openSearch();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeSearch, openSearch, searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    const focusables = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawer) return;
      const items = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [menuOpen]);

  // Close the mobile drawer + scroll to top on route change.
  useEffect(() => {
    setMenuOpen(false);
    const main = document.getElementById('main');
    if (main) main.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:border focus:border-accent/40 focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text"
      >
        Skip to content
      </a>
      <TopBar
        onOpenMenu={() => setMenuOpen(true)}
        onOpenSearch={openSearch}
        searchButtonRef={searchButtonRef}
      />

      <div className="mx-auto flex w-full max-w-[1600px] overflow-x-hidden">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-r border-border lg:block">
          <Sidebar />
        </aside>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default bg-[var(--scrim)]"
              aria-label="Dismiss navigation overlay"
              onClick={() => setMenuOpen(false)}
            />
            <aside
              ref={drawerRef}
              className="absolute left-0 top-0 h-full w-[min(20rem,calc(100vw-2rem))] overflow-y-auto border-r border-border bg-surface shadow-[var(--shadow-pop)]"
              role="dialog"
              aria-modal="true"
              aria-label="Gallery navigation"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
                <span className="font-display text-sm font-semibold text-text">Navigation</span>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-2 text-muted"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  ×
                </button>
              </div>
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </aside>
          </div>
        )}

        <main id="main" tabIndex={-1} className="h-[calc(100vh-3.5rem)] min-w-0 flex-1 overflow-y-auto">
          <ErrorBoundary key={location.pathname}>
            <Suspense
              fallback={
                <div className="mx-auto grid max-w-3xl gap-4 px-6 py-16" role="status" aria-label="Loading page">
                  <div className="gx-card overflow-hidden p-6">
                    <div className="flex items-center gap-3">
                      <Spinner className="h-5 w-5" />
                      <span className="text-sm font-medium text-muted">Loading gallery page…</span>
                    </div>
                    <div className="mt-6 space-y-3">
                      <div className="h-4 w-2/3 rounded-full bg-surface-2" />
                      <div className="h-4 w-full rounded-full bg-surface-2" />
                      <div className="h-4 w-5/6 rounded-full bg-surface-2" />
                    </div>
                  </div>
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
