import { ArrowRight, Sparkles } from 'lucide-react';
import { KaiHubShell } from '../components/hub/KaiHubShell';
import { getKaiApps } from '../data/kaiApps';
import { getKaiWriterOrigin } from '../lib/site';
import { TEMPLATE_COUNT } from '../data/templates';
import styles from './KaiHubView.module.css';

export function KaiHubView() {
  const apps = getKaiApps();
  const writerOrigin = getKaiWriterOrigin();

  return (
    <KaiHubShell activeAppId={undefined} variant="hub" pageScroll>
      <div className={styles.page}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Kai ecosystem · hub.kainoter.com</p>
          <h1>Professional tools that work together — privacy first</h1>
          <p className={styles.heroSub}>
            KaiHub connects document creation, signing, delivery, and more. Start with KaiWriter — {TEMPLATE_COUNT} structured templates, cloud sync, and exports clients expect.
          </p>
          <a href={`${writerOrigin}/app`} className={styles.heroCta}>
            Launch KaiWriter <ArrowRight size={18} />
          </a>
        </section>

        <section className={styles.appsSection}>
          <div className={styles.sectionHead}>
            <h2>Apps</h2>
            <p>One account across the Kai suite. More apps shipping soon.</p>
          </div>
          <div className={styles.appGrid}>
            {apps.map((app) => {
              const Icon = app.icon;
              const isLive = app.status === 'live';
              const href = isLive && app.id === 'kaiwriter' ? `${writerOrigin}/app` : undefined;
              const CardTag = isLive && href ? 'a' : 'article';
              return (
                <CardTag
                  key={app.id}
                  href={href}
                  className={`${styles.appCard} ${isLive ? styles.appCardLive : styles.appCardSoon}`}
                >
                  {isLive && (
                    <span className={styles.liveBadge}>
                      <Sparkles size={11} /> Live
                    </span>
                  )}
                  {!isLive && <span className={styles.soonBadge}>Soon</span>}
                  <div className={styles.appIconWrap}>
                    <Icon size={26} />
                  </div>
                  <h3>{app.name}</h3>
                  <p className={styles.appTagline}>{app.tagline}</p>
                  <p className={styles.appDesc}>{app.description}</p>
                  {isLive && href && (
                    <span className={styles.appLink}>
                      Open app <ArrowRight size={14} />
                    </span>
                  )}
                </CardTag>
              );
            })}
          </div>
        </section>

        <footer className={styles.footer}>
          <span>© {new Date().getFullYear()} Kainoter · KaiHub</span>
          <a href={`${writerOrigin}/`}>KaiWriter marketing</a>
        </footer>
      </div>
    </KaiHubShell>
  );
}
