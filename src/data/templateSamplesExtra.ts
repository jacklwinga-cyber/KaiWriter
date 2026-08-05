import { lexicalBuilder as lb } from '../lib/lexicalBuilder';
import { DOCUMENT_TEMPLATES, TEMPLATE_CATEGORIES } from './templates/index';

const { paragraph, heading, bulletList, buildEditorState, text } = lb;

const TEMPLATE_COUNT = DOCUMENT_TEMPLATES.length;
const CATEGORY_COUNT = TEMPLATE_CATEGORIES.length;

/** Sample content for templates added in catalog expansion. */
export const TEMPLATE_SAMPLE_CONTENT_EXTRA: Record<string, string> = {
  letterhead: buildEditorState(
    paragraph(text('NORTHWIND STUDIO')),
    heading('h1', 'Northwind Studio'),
    paragraph(text('Design that moves business forward'), text('\n428 Market Street • San Francisco, CA'), text('\nhello@northwind.io • (415) 555-0192')),
    paragraph(text('')),
    paragraph(text('June 13, 2026')),
    paragraph(text('')),
    paragraph(text('Michael Torres'), text('\nVP of Partnerships, Brightline Logistics')),
    paragraph(text('')),
    paragraph(text('Dear Michael,')),
    paragraph(text('')),
    paragraph(text('Following our conversation last week, I am pleased to confirm Northwind Studio will lead the Q3 brand refresh project for Brightline Logistics.')),
    paragraph(text('')),
    paragraph(text('Our team will deliver updated visual identity guidelines, marketing templates, and sales collateral by August 15.')),
    paragraph(text('')),
    paragraph(text('Best regards,')),
    paragraph(text('Sarah Chen, Director of Operations')),
  ),

  'business-plan': buildEditorState(
    heading('h1', 'BUSINESS PLAN'),
    paragraph(text('KaiWriter Inc.'), text('\nProfessional document software for teams who value privacy'), text('\nJune 2026 | Confidential')),
    paragraph(text('')),
    heading('h2', 'Executive Summary'),
    paragraph(text('KaiWriter is a privacy-first document studio targeting professionals who need polished output without AI rewriting their work. We serve freelancers, SMBs, and academic users with templates, cloud sync, and premium exports.')),
    paragraph(text('')),
    heading('h2', 'Market Analysis'),
    paragraph(text('TAM: $12B productivity software | SAM: $2.1B document tools | Target: 2M solo professionals in US/EU')),
    paragraph(text('')),
    heading('h2', 'Competitor Analysis'),
    paragraph(text('Microsoft Word — ubiquitous but complex | Google Docs — collaborative but generic | Notion — flexible but not print-ready')),
    paragraph(text('')),
    heading('h2', 'Financial Projections'),
    paragraph(text('Year 1: $180K ARR | Year 2: $620K | Year 3: $1.4M | Break-even: Month 18')),
    paragraph(text('')),
    heading('h2', 'Funding Requirements'),
    paragraph(text('Seeking $750K seed to accelerate template library, desktop app, and go-to-market. 18-month runway.')),
  ),

  quote: buildEditorState(
    heading('h1', 'QUOTE'),
    paragraph(text('Quote #: QT-2026-088'), text('\nDate: June 13, 2026'), text('\nValid until: July 13, 2026')),
    paragraph(text('')),
    paragraph(text('Prepared for: Harbor & Co. Retail'), text('\nPrepared by: Studio Meridian')),
    paragraph(text('')),
    heading('h2', 'Line Items'),
    paragraph(text('UX Audit & Recommendations | 1 | $4,500 | $4,500'), text('\nVisual Design System | 1 | $8,200 | $8,200'), text('\nDevelopment Support (40 hrs) | 40 | $150 | $6,000')),
    paragraph(text('')),
    paragraph(text('Subtotal: $18,700 | Tax: $0 | Total: $18,700')),
    paragraph(text('Terms: 40% upfront, balance on delivery. Quote valid 30 days.')),
  ),

  estimate: buildEditorState(
    heading('h1', 'COST ESTIMATE'),
    paragraph(text('Project: Office Renovation — Phase 2'), text('\nEstimate Date: June 13, 2026'), text('\nPrepared by: BuildRight Contractors')),
    paragraph(text('')),
    heading('h2', 'Cost Breakdown'),
    bulletList('Labor: $42,000 — 480 hours @ blended rate', 'Materials: $28,500 — flooring, fixtures, paint', 'Overhead: $6,200', 'Contingency (10%): $7,670'),
    paragraph(text('')),
    paragraph(text('Estimated Total: $84,370'), text('\nAssumptions: No structural changes; client-provided appliances; permits extra.')),
  ),

  'purchase-order': buildEditorState(
    heading('h1', 'PURCHASE ORDER'),
    paragraph(text('PO Number: PO-4421'), text('\nDate: June 13, 2026'), text('\nRequested by: Operations — Priya Nair')),
    paragraph(text('')),
    paragraph(text('Vendor: OfficeSupply Pro'), text('\n1200 Industrial Way, Austin TX'), text('\nContact: orders@officesupplypro.com')),
    paragraph(text('')),
    heading('h2', 'Items Ordered'),
    paragraph(text('SKU-8842 | Ergonomic chairs (black) | 12 | $249 | $2,988'), text('\nSKU-1102 | Standing desks | 6 | $599 | $3,594')),
    paragraph(text('')),
    paragraph(text('Ship to: 428 Market St, SF CA 94105 | Delivery: June 20, 2026 | Total: $6,582')),
  ),

  receipt: buildEditorState(
    heading('h1', 'RECEIPT'),
    paragraph(text('Receipt #: RCP-2026-331'), text('\nDate: June 13, 2026'), text('\nReceived from: Harbor & Co. Retail')),
    paragraph(text('')),
    paragraph(text('Phase 1 — UX Audit: $9,800.00'), text('\nPayment method: ACH transfer'), text('\nBalance remaining: $14,700.00')),
    paragraph(text('Thank you for your payment. — Studio Meridian')),
  ),

  'credit-note': buildEditorState(
    heading('h1', 'CREDIT NOTE'),
    paragraph(text('Credit Note #: CN-2026-012'), text('\nDate: June 13, 2026'), text('\nOriginal Invoice: INV-2026-042')),
    paragraph(text('')),
    paragraph(text('Issued to: Harbor & Co. Retail'), text('\nIssued by: Studio Meridian')),
    paragraph(text('')),
    paragraph(text('Reason: Billing adjustment for unused design revision round per agreement dated May 28.')),
    paragraph(text('')),
    paragraph(text('Design revisions (unused) | $1,200.00'), text('\nTotal Credit: $1,200.00')),
  ),

  'statement-of-account': buildEditorState(
    heading('h1', 'STATEMENT OF ACCOUNT'),
    paragraph(text('Account: Harbor & Co. Retail'), text('\nPeriod: May 1 – June 13, 2026'), text('\nAccount #: ACC-HC-004')),
    paragraph(text('')),
    paragraph(text('Opening Balance: $0.00 | Invoices: $24,500 | Payments: $9,800 | Credits: $1,200 | Balance Due: $13,500')),
    paragraph(text('')),
    paragraph(text('Aging: Current $13,500 | 1–30 days $0 | 31–60 days $0')),
    paragraph(text('Payment due: June 27, 2026')),
  ),

  'expense-report': buildEditorState(
    heading('h1', 'EXPENSE REPORT'),
    paragraph(text('Employee: Alex Rivera'), text('\nDepartment: Customer Success'), text('\nPeriod: June 1–13, 2026')),
    paragraph(text('')),
    paragraph(text('Jun 4 | Travel | Client site visit — SFO | $186.00'), text('\nJun 7 | Meals | Team lunch (4 attendees) | $92.40'), text('\nJun 11 | Supplies | Presentation materials | $34.20')),
    paragraph(text('')),
    paragraph(text('Total Reimbursement Requested: $312.60')),
  ),

  nda: buildEditorState(
    heading('h1', 'NON-DISCLOSURE AGREEMENT'),
    paragraph(text('Effective Date: June 13, 2026')),
    paragraph(text('')),
    paragraph(text('Disclosing Party: Northwind Studio ("Discloser")'), text('\nReceiving Party: Brightline Logistics ("Recipient")')),
    paragraph(text('')),
    heading('h2', '1. Confidential Information'),
    paragraph(text('Includes business plans, pricing, customer lists, product roadmaps, and technical documentation shared for the Q3 partnership evaluation.')),
    paragraph(text('')),
    heading('h2', '2. Term'),
    paragraph(text('This Agreement remains in effect for 3 years from the Effective Date.')),
    paragraph(text('')),
    paragraph(text('Discloser: Sarah Chen ______________  Recipient: Michael Torres ______________')),
  ),

  'compliance-policy': buildEditorState(
    heading('h1', 'Remote Work Security Policy'),
    paragraph(text('Version: 2.1 | Effective: June 1, 2026 | Owner: IT Security')),
    paragraph(text('')),
    heading('h2', 'Purpose'),
    paragraph(text('Define security requirements for employees working outside company offices.')),
    paragraph(text('')),
    heading('h2', 'Policy Statements'),
    bulletList('Use company-managed devices or approved MDM enrollment', 'Enable full-disk encryption and automatic screen lock', 'Do not store customer data on personal cloud accounts'),
    paragraph(text('')),
    paragraph(text('Approved by: Jordan Kim, CISO — June 1, 2026')),
  ),

  'employment-agreement': buildEditorState(
    heading('h1', 'EMPLOYMENT AGREEMENT'),
    paragraph(text('Date: June 13, 2026 | Employee: Mei Lin | Employer: KaiWriter Inc.')),
    paragraph(text('')),
    paragraph(text('Title: Senior Product Designer | Start: July 7, 2026 | Location: Remote (US)')),
    paragraph(text('Base salary: $128,000/year, paid bi-weekly. Benefits per employee handbook.')),
    paragraph(text('')),
    paragraph(text('Employee: Mei Lin ______________  Employer: KaiWriter Inc. ______________')),
    paragraph(text('This template is for informational purposes only and does not constitute legal advice.')),
  ),

  'privacy-policy': buildEditorState(
    heading('h1', 'Privacy Policy'),
    paragraph(text('KaiWriter Inc. | Effective: June 13, 2026')),
    paragraph(text('')),
    heading('h2', 'Information We Collect'),
    paragraph(text('Account email, document metadata, usage analytics, and payment information processed by Stripe.')),
    paragraph(text('')),
    heading('h2', 'Your Rights'),
    paragraph(text('Request access, correction, or deletion at privacy@kaiwriter.app.')),
    paragraph(text('This template is a starting point only and does not constitute legal advice.')),
  ),

  'terms-of-service': buildEditorState(
    heading('h1', 'Terms of Service'),
    paragraph(text('KaiWriter | Effective: June 13, 2026')),
    paragraph(text('')),
    paragraph(text('By using KaiWriter you agree to these Terms. You retain ownership of your documents. We do not use your content to train AI models.')),
    paragraph(text('')),
    paragraph(text('Subscriptions renew automatically unless cancelled. Contact: legal@kaiwriter.app')),
    paragraph(text('This template is a starting point only and does not constitute legal advice.')),
  ),

  assignment: buildEditorState(
    heading('h1', 'The Impact of Async Communication on Team Performance'),
    paragraph(text('Student: Jordan Kim | Course: ORG 442 | Instructor: Dr. Vasquez | Due: June 20, 2026')),
    paragraph(text('')),
    heading('h2', 'Introduction'),
    paragraph(text('This paper examines whether structured async communication improves outcomes in distributed software teams.')),
    paragraph(text('')),
    heading('h2', 'Conclusion'),
    paragraph(text('Teams with documented rituals report higher cohesion without increasing meeting load.')),
  ),

  thesis: buildEditorState(
    heading('h1', 'Distributed Collaboration in Modern Organizations'),
    paragraph(text('Jordan Kim | M.S. Information Systems | Westlake University')),
    paragraph(text('')),
    heading('h2', 'Abstract'),
    paragraph(text('Draft abstract — research on communication systems and team cohesion in remote engineering teams.')),
    paragraph(text('')),
    heading('h2', 'Chapter 1 — Introduction'),
    paragraph(text('Research problem, questions, and significance.')),
  ),

  planner: buildEditorState(
    heading('h1', 'Weekly Planner'),
    paragraph(text('Week of: June 16 – 22, 2026 | Focus: Ship template expansion')),
    paragraph(text('')),
    heading('h2', 'Top 3 Goals'),
    bulletList('Complete finance template samples', 'QA populate toggle on all templates', 'Update landing page copy'),
    paragraph(text('')),
    heading('h2', 'Weekly Review'),
    paragraph(text('What went well: Gallery UX polish. Next week: Desktop build test.')),
  ),

  brochure: buildEditorState(
    heading('h1', 'KaiWriter Pro'),
    paragraph(text('Professional documents without the complexity')),
    paragraph(text('')),
    heading('h2', 'Key Features'),
    bulletList(`${TEMPLATE_COUNT} professional templates across ${CATEGORY_COUNT} categories`, 'Cloud sync with privacy-first architecture', 'Word-compatible DOCX export'),
    paragraph(text('')),
    paragraph(text('Start free at kaiwriter.app')),
  ),

  'press-release': buildEditorState(
    heading('h1', 'FOR IMMEDIATE RELEASE'),
    paragraph(text('')),
    heading('h1', 'KaiWriter Launches Premium Template Library for Business and Academic Users'),
    paragraph(text(`San Francisco, CA — June 13, 2026 — KaiWriter today announced ${TEMPLATE_COUNT} professionally structured templates spanning business, finance, legal, and education.`)),
    paragraph(text('')),
    paragraph(text('"Professionals told us they want structure without AI rewriting their words," said CEO Jordan Ellis.')),
    paragraph(text('')),
    paragraph(text('Media Contact: press@kaiwriter.app')),
  ),

  'project-plan': buildEditorState(
    heading('h1', 'Project Plan'),
    paragraph(text('Project: Template Library v2 | PM: Daniel Cho | Jun 13 – Aug 30, 2026')),
    paragraph(text('')),
    heading('h2', 'Milestones'),
    bulletList('Catalog expansion complete — Jun 20', 'Sample content for all templates — Jun 27', 'Public launch — Jul 15'),
    paragraph(text('')),
    heading('h2', 'Risk Register'),
    paragraph(text('Scope creep | Medium | Weekly scope review with sponsor')),
  ),

  'todo-list': buildEditorState(
    heading('h1', 'To-Do List'),
    paragraph(text('Date: June 13, 2026 | Focus: Template QA')),
    paragraph(text('')),
    heading('h2', 'High Priority'),
    bulletList('[ ] Verify all template thumbnails render', '[ ] Test populate toggle on new templates'),
    paragraph(text('')),
    heading('h2', 'Completed'),
    bulletList('[x] Add finance templates', '[x] Add legal templates'),
  ),

  manuscript: buildEditorState(
    heading('h1', 'The Distance Between Us'),
    paragraph(text('by Amina Okonkwo')),
    paragraph(text('')),
    heading('h2', 'Chapter One'),
    paragraph(text('The notification arrived at 2:47 a.m., pulsing on the nightstand like a small, insistent star.')),
  ),

  screenplay: buildEditorState(
    heading('h1', 'NIGHT SHIFT'),
    paragraph(text('Written by Alex Rivera')),
    paragraph(text('')),
    paragraph(text('INT. CALL CENTER - NIGHT')),
    paragraph(text('')),
    paragraph(text('Fluorescent lights hum. MAYA (32) stares at a wall of monitors.')),
    paragraph(text('')),
    paragraph(text('MAYA'), text('We have thirty seconds before the whole east coast wakes up angry.')),
  ),

  storyboard: buildEditorState(
    heading('h1', 'Storyboard — Product Launch Video'),
    paragraph(text('')),
    heading('h2', 'Frame 1'),
    paragraph(text('Wide shot: Dashboard template gallery. VO: "Start with structure."')),
    heading('h2', 'Frame 2'),
    paragraph(text('Close-up: User selects Executive Proposal. VO: "Ship polished work fast."')),
  ),

  'one-pager': buildEditorState(
    heading('h1', 'KaiWriter'),
    paragraph(text('Professional documents. Your words. No AI rewriting.')),
    paragraph(text('')),
    heading('h2', 'The Problem'),
    paragraph(text('Word is overwhelming. Docs feels generic. Professionals need polished output without losing control of their content.')),
    paragraph(text('')),
    heading('h2', 'Our Solution'),
    bulletList(`${TEMPLATE_COUNT} professional templates`, 'Privacy-first cloud sync', 'DOCX & PDF export'),
    paragraph(text('')),
    paragraph(text('10K+ documents created | 4.8★ user rating | Start free → kaiwriter.app')),
  ),

  'case-study': buildEditorState(
    heading('h1', 'Case Study: Northwind Studio'),
    paragraph(text('Industry: Creative Services | 45 employees | San Francisco')),
    paragraph(text('')),
    heading('h2', 'The Challenge'),
    paragraph(text('Northwind\'s team spent 6+ hours weekly reformatting client deliverables in Word.')),
    paragraph(text('')),
    heading('h2', 'Results'),
    bulletList('60% reduction in formatting time', 'Consistent branded exports across 12 template types', 'Client satisfaction score up 18 points'),
    paragraph(text('')),
    paragraph(text('"KaiWriter let us focus on strategy instead of margins and styles." — Sarah Chen, Director')),
  ),

  'media-kit': buildEditorState(
    heading('h1', 'KaiWriter — Media Kit'),
    paragraph(text('Updated: June 2026 | press@kaiwriter.app')),
    paragraph(text('')),
    heading('h2', 'Company at a Glance'),
    paragraph(text('Founded: 2025 | HQ: San Francisco | Mission: Privacy-first professional document creation')),
    paragraph(text('')),
    heading('h2', 'Boilerplate'),
    paragraph(text('KaiWriter is a document studio for professionals who need structure, exports, and sync — without AI rewriting their work.')),
    paragraph(text('')),
    heading('h2', 'Press Contact'),
    paragraph(text('Jordan Ellis, CEO | press@kaiwriter.app')),
  ),

  'payment-reminder': buildEditorState(
    heading('h1', 'PAYMENT REMINDER'),
    paragraph(text('Studio Meridian | billing@studiomeridian.co')),
    paragraph(text('')),
    paragraph(text('Dear Harbor & Co. team,')),
    paragraph(text('')),
    paragraph(text('Invoice INV-2026-042 for $13,500 was due June 27. Please remit at your earliest convenience or contact us to arrange a payment plan.')),
    paragraph(text('')),
    paragraph(text('Pay online: pay.studiomeridian.co/harbor | Questions: Alex, billing@studiomeridian.co')),
  ),

  'budget-planner': buildEditorState(
    heading('h1', 'Monthly Budget — June 2026'),
    paragraph(text('')),
    paragraph(text('Income: Salary $6,200 | Freelance $800 | Total $7,000')),
    paragraph(text('Expenses: Housing $2,100 | Food $520 | Transport $180 | Subscriptions $64')),
    paragraph(text('')),
    paragraph(text('Planned surplus: $1,136 | Savings goal: $800 | Actual surplus: $1,052')),
  ),

  'sla-agreement': buildEditorState(
    heading('h1', 'SERVICE LEVEL AGREEMENT'),
    paragraph(text('KaiWriter Inc. ↔ Northwind Studio | Effective June 2026')),
    paragraph(text('')),
    paragraph(text('Uptime target: 99.9% | Critical response: 1 hr | Standard resolution: 2 business days')),
  ),

  'vendor-agreement': buildEditorState(
    heading('h1', 'VENDOR AGREEMENT'),
    paragraph(text('KaiWriter Inc. (Buyer) ↔ CloudHost Pro (Vendor)')),
    paragraph(text('')),
    paragraph(text('Managed hosting services | $1,200/mo | Net 30 payment terms')),
  ),

  'email-campaign': buildEditorState(
    heading('h1', 'Email Campaign — Pro Launch'),
    paragraph(text('Subject: Your documents deserve better than generic templates')),
    paragraph(text('')),
    paragraph(text(`Introducing ${TEMPLATE_COUNT} professional templates across business, finance, legal, and more. Start free — upgrade when you need DOCX export and cloud sync.`)),
    paragraph(text('')),
    paragraph(text('CTA: Explore templates → kaiwriter.app/app')),
  ),

  'product-sheet': buildEditorState(
    heading('h1', 'KaiWriter Pro'),
    paragraph(text('Professional document studio for teams who value privacy')),
    paragraph(text('')),
    bulletList(`${TEMPLATE_COUNT} structured templates`, 'Cloud sync & version history', 'Branded DOCX export'),
    paragraph(text('')),
    paragraph(text('Pro: $12/mo | Enterprise: Contact sales@kaiwriter.app')),
  ),

  'sprint-retrospective': buildEditorState(
    heading('h1', 'Sprint 14 Retrospective'),
    paragraph(text('Team: Product | Date: June 13, 2026 | Mood: Positive')),
    paragraph(text('')),
    heading('h2', 'Went Well'),
    bulletList(`Shipped template catalog to ${TEMPLATE_COUNT}`, 'Zero P1 bugs in production'),
    heading('h2', 'Improve'),
    bulletList('Earlier design review on thumbnails'),
    paragraph(text('Action: Design QA checklist — Mei — June 20')),
  ),
};
