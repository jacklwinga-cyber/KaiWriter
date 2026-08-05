import { Link } from 'react-router-dom';
import { Check, FileText, Shield, Sparkles, Cloud, Download } from 'lucide-react';
import { KaiHubShell } from '../components/hub/KaiHubShell';
import styles from './LandingView.module.css';
import { PRO_FEATURES, PRO_PRICE_ANNUAL, PRO_PRICE_MONTHLY } from '../lib/stripe';
import { TEMPLATE_COUNT, TEMPLATE_CATEGORY_COUNT, PREMIUM_TEMPLATE_COUNT } from '../data/templates';

const FREE_TEMPLATE_COUNT = TEMPLATE_COUNT - PREMIUM_TEMPLATE_COUNT;

export function LandingView() {
  return (
    <KaiHubShell activeAppId="kaiwriter" variant="writer" pageScroll>
      <div className={styles.page}>
        <nav className={styles.subnav}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </nav>

        <div className={styles.pageInner}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Professional document studio</p>
          <h1>Polished documents in minutes — without Word&apos;s complexity</h1>
          <p className={styles.heroSub}>
            Industry templates, optional cloud sync, and exports that look serious. AI helps fill placeholders — you approve every change.
          </p>
          <div className={styles.heroActions}>
            <Link to="/app" className={styles.primaryBtn}>Start writing free</Link>
            <a href="#pricing" className={styles.secondaryBtn}>See Pro plans</a>
          </div>
          <p className={styles.trialNote}>No account required to try. Pro includes a 14-day free trial after email sign-in.</p>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.mockDoc} aria-label="KaiWriter editor preview">
            <div className={styles.mockToolbar}>
              <span className={styles.mockToolbarDot} />
              <span className={styles.mockToolbarDot} />
              <span className={styles.mockToolbarDot} />
              <span className={styles.mockToolbarTitle}>KaiWriter</span>
            </div>
            <div className={styles.mockPage}>
              <p className={styles.mockDocTitle}>Business Proposal</p>
              <p className={styles.mockDocMeta}>Prepared for Acme Corp · Q2 2026</p>
              <div className={styles.mockLine} style={{ width: '100%' }} />
              <div className={styles.mockLine} style={{ width: '92%' }} />
              <div className={styles.mockLine} style={{ width: '88%' }} />
              <div className={styles.mockLine} style={{ width: '72%' }} />
            </div>
          </div>
          <p className={styles.mockCaption}>Editor preview</p>
        </div>
      </section>

      <section id="features" className={styles.features}>
        <h2>Built for professionals across every field</h2>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}>
            <FileText size={28} />
            <h3>{TEMPLATE_COUNT} professional templates</h3>
            <p>{FREE_TEMPLATE_COUNT} free templates plus {PREMIUM_TEMPLATE_COUNT} flagship Pro designs — organized across {TEMPLATE_CATEGORY_COUNT} categories.</p>
          </article>
          <article className={styles.featureCard}>
            <Sparkles size={28} />
            <h3>Smart template wizard</h3>
            <p>Pick a template, answer a few questions — client name, dates, amounts — and placeholders fill in automatically.</p>
          </article>
          <article className={styles.featureCard}>
            <Download size={28} />
            <h3>Export that impresses</h3>
            <p>Free print/save-as-PDF and TXT. Pro unlocks Word-compatible DOCX for clients and recruiters.</p>
          </article>
          <article className={styles.featureCard}>
            <Cloud size={28} />
            <h3>Guest mode or cloud sync</h3>
            <p>Start instantly with no account. Sign in with email when you want documents on every device — optional PIN lock included.</p>
          </article>
          <article className={styles.featureCard}>
            <Shield size={28} />
            <h3>Grammar &amp; proofread</h3>
            <p>Built-in spelling, grammar, and clarity checks with one-click fixes — plus writing suggestions for professional tone.</p>
          </article>
        </div>
      </section>

      <section id="pricing" className={styles.pricing}>
        <h2>Simple pricing</h2>
        <div className={styles.pricingGrid}>
          <article className={styles.priceCard}>
            <h3>Free</h3>
            <p className={styles.price}>$0</p>
            <ul>
              <li><Check size={16} /> Up to 3 documents</li>
              <li><Check size={16} /> {FREE_TEMPLATE_COUNT} free templates + blank document</li>
              <li><Check size={16} /> Print / Save as PDF &amp; TXT export</li>
            </ul>
            <Link to="/app" className={styles.secondaryBtn}>Get started — no account</Link>
          </article>
          <article className={`${styles.priceCard} ${styles.priceCardPro}`}>
            <div className={styles.proBadge}><Sparkles size={14} /> Pro</div>
            <h3>KaiWriter Pro</h3>
            <p className={styles.price}>${PRO_PRICE_MONTHLY}<span>/mo</span></p>
            <p className={styles.annualNote}>or ${PRO_PRICE_ANNUAL}/year — save 34%</p>
            <ul>
              {PRO_FEATURES.slice(0, 6).map((f) => (
                <li key={f}><Check size={16} /> {f}</li>
              ))}
            </ul>
            <Link to="/app" className={styles.primaryBtn}>Sign in &amp; start trial</Link>
          </article>
        </div>
      </section>
        </div>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} KaiWriter</span>
        <Link to="/app">Open App</Link>
      </footer>
      </div>
    </KaiHubShell>
  );
}
