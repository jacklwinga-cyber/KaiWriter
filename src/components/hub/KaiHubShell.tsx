import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Grid3X3, ExternalLink } from 'lucide-react';
import { getKaiApps, type KaiApp } from '../../data/kaiApps';
import { getKaiHubOrigin, getKaiWriterOrigin, isHubHost } from '../../lib/site';
import styles from './KaiHubShell.module.css';

interface KaiHubShellProps {
  activeAppId?: string;
  children: React.ReactNode;
  /** Hub home uses external writer links; writer landing uses in-app paths where possible */
  variant?: 'hub' | 'writer';
  /** Allow full-page scroll (landing pages) instead of locked app viewport */
  pageScroll?: boolean;
}

export function KaiHubShell({ activeAppId, children, variant, pageScroll }: KaiHubShellProps) {
  const resolvedVariant = variant ?? (isHubHost() ? 'hub' : 'writer');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const apps = getKaiApps();
  const active = activeAppId ? apps.find((a) => a.id === activeAppId) : undefined;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!pageScroll) return;
    document.documentElement.classList.add('kai-marketing-scroll');
    return () => document.documentElement.classList.remove('kai-marketing-scroll');
  }, [pageScroll]);

  const hubHome = getKaiHubOrigin();
  const writerHome = getKaiWriterOrigin();

  const resolveHref = (app: KaiApp): string => {
    if (app.status !== 'live') return '#';
    if (app.id === 'kaiwriter') {
      return resolvedVariant === 'hub' ? `${writerHome}/app` : '/app';
    }
    return app.href;
  };

  return (
    <div className={`${styles.shell} ${pageScroll ? styles.shellPageScroll : ''}`}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
        <a href={hubHome} className={styles.hubBrand}>
          <img src="/logo.jpg" alt="" className={styles.logo} />
          <span>KaiHub</span>
          <span className={styles.hubDot}>hub.kainoter.com</span>
        </a>

        <div className={styles.headerCenter}>
          <div className={styles.switcher} ref={menuRef}>
            <button
              type="button"
              className={styles.switcherBtn}
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
            >
              <Grid3X3 size={16} />
              <span className={styles.switcherLabel}>{active?.name ?? 'All apps'}</span>
              <ChevronDown size={14} className={menuOpen ? styles.chevronOpen : undefined} />
            </button>
            {menuOpen && (
              <div className={styles.switcherMenu} role="listbox">
                {apps.map((app) => {
                  const Icon = app.icon;
                  const href = resolveHref(app);
                  const isActive = app.id === activeAppId;
                  const disabled = app.status === 'soon';
                  return (
                    <a
                      key={app.id}
                      href={disabled ? undefined : href}
                      className={`${styles.switcherItem} ${isActive ? styles.switcherItemActive : ''} ${disabled ? styles.switcherItemSoon : ''}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={(e) => {
                        if (disabled) e.preventDefault();
                        else setMenuOpen(false);
                      }}
                    >
                      <Icon size={18} className={styles.switcherIcon} />
                      <span className={styles.switcherItemText}>
                        <strong>{app.name}</strong>
                        <small>{app.status === 'soon' ? 'Coming soon' : app.tagline}</small>
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <nav className={styles.headerNav}>
          {resolvedVariant === 'writer' && (
            <a href={hubHome} className={styles.navLink}>
              All apps <ExternalLink size={12} />
            </a>
          )}
          <a
            href={resolvedVariant === 'hub' ? `${writerHome}/app` : '/app'}
            className={styles.navCta}
          >
            Open KaiWriter
          </a>
        </nav>
        </div>
      </header>
      <main className={`${styles.main} ${pageScroll ? styles.mainPageScroll : ''}`}>{children}</main>
    </div>
  );
}
