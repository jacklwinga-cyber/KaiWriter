/** Merge-field extraction and replacement for template wizard (Phase 3). */

export interface WizardField {
  id: string;
  label: string;
  /** Exact bracket tokens replaced in template content, e.g. "[Client Name]" */
  tokens: string[];
  type: 'text' | 'date' | 'currency';
  priority: number;
  defaultValue?: () => string;
}

interface FieldDef {
  id: string;
  label: string;
  tokens: string[];
  type?: WizardField['type'];
  priority: number;
  defaultValue?: () => string;
}

const BRACKET_TOKEN = /\[([^\[\]]+)\]/g;

function isMergeToken(token: string): boolean {
  const inner = token.slice(1, -1).trim();
  if (!inner || inner.length < 2) return false;
  if (/^[xX]?$/.test(inner)) return false;
  if (/^[\d.,$%\s]+$/.test(inner)) return false;
  if (/^e\.g\./i.test(inner)) return false;
  if (/^\d/.test(inner)) return false;
  if (/^(Deliverable|Item|Service|Milestone|Risk|Recommendation|Phase|Skill|Tool|Goal|Benefit|Metric|Action)\s*\d/i.test(inner)) {
    return false;
  }
  return true;
}

export function extractBracketTokens(content: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of content.matchAll(BRACKET_TOKEN)) {
    const full = `[${match[1]}]`;
    if (!isMergeToken(full) || seen.has(full)) continue;
    seen.add(full);
    tokens.push(full);
  }
  return tokens;
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const FIELD_CATALOG: FieldDef[] = [
  {
    id: 'yourName',
    label: 'Your name',
    tokens: ['[Your Name]', '[Your Full Name]', '[Author Name]', '[Your Name / Team]', '[Print Name]'],
    priority: 10,
  },
  {
    id: 'yourCompany',
    label: 'Your company or business',
    tokens: ['[Your Company]', '[Your Company Name]', '[Your Business Name]', '[Company / Individual Name]'],
    priority: 20,
  },
  {
    id: 'clientName',
    label: 'Client or recipient',
    tokens: ['[Client Name]', '[Client Name / Company]', '[Client Company]', '[Company Name]', '[Recipient Name]', '[Contact Person]'],
    priority: 30,
  },
  {
    id: 'projectTitle',
    label: 'Project or document title',
    tokens: ['[Project Title]', '[Project Name]', '[Paper Title]', '[Job Title]'],
    priority: 40,
  },
  {
    id: 'date',
    label: 'Date',
    tokens: ['[Date]', '[Issue Date]', '[Due Date]', '[Start Date]', '[End Date]'],
    type: 'date',
    priority: 50,
    defaultValue: formatToday,
  },
  {
    id: 'amount',
    label: 'Amount',
    tokens: ['[Amount]', '$[0.00]', '$[Amount]'],
    type: 'currency',
    priority: 60,
  },
  {
    id: 'email',
    label: 'Email address',
    tokens: ['[Email]', '[Client Email]', '[billing@email.com]'],
    priority: 70,
  },
  {
    id: 'referenceNumber',
    label: 'Reference or invoice number',
    tokens: ['[INV-001]', '[PRO-001]', '[QT-001]', '[AGR-001]'],
    priority: 80,
  },
];

/** Per-template field priority overrides (field ids). */
export const TEMPLATE_WIZARD_FIELDS: Partial<Record<string, string[]>> = {
  proposal: ['yourCompany', 'clientName', 'projectTitle', 'date', 'amount'],
  invoice: ['yourCompany', 'clientName', 'date', 'referenceNumber', 'amount'],
  'business-letter': ['yourName', 'yourCompany', 'clientName', 'date'],
  resume: ['yourName', 'email', 'projectTitle'],
  cv: ['yourName', 'email', 'projectTitle'],
  quote: ['yourCompany', 'clientName', 'date', 'amount'],
  'cover-letter': ['yourName', 'clientName', 'date'],
  'meeting-minutes': ['projectTitle', 'date', 'yourName'],
  'one-pager': ['yourCompany', 'projectTitle', 'email'],
};

const MAX_WIZARD_FIELDS = 5;

function inferFieldId(token: string): string | undefined {
  const inner = token.slice(1, -1).toLowerCase();
  if (inner.includes('your name') || inner === 'author name' || inner === 'print name') return 'yourName';
  if (inner.includes('your company') || inner.includes('your business') || inner.includes('business name')) {
    return 'yourCompany';
  }
  if (inner.includes('client') || inner.includes('recipient') || inner.includes('bill to')) return 'clientName';
  if (inner.includes('project') || inner.includes('paper title') || inner.includes('job title')) return 'projectTitle';
  if (inner.includes('date')) return 'date';
  if (inner.includes('amount') || inner.includes('total due') || inner.includes('total fee')) return 'amount';
  if (inner.includes('email')) return 'email';
  if (/inv-|pro-|qt-|agr-/.test(inner)) return 'referenceNumber';
  return undefined;
}

function catalogEntryForToken(token: string): FieldDef | undefined {
  const exact = FIELD_CATALOG.find((field) => field.tokens.includes(token));
  if (exact) return exact;

  const inferredId = inferFieldId(token);
  if (inferredId) return FIELD_CATALOG.find((field) => field.id === inferredId);

  return undefined;
}

function fieldFromDef(def: FieldDef, tokens: string[]): WizardField {
  return {
    id: def.id,
    label: def.label,
    tokens,
    type: def.type ?? 'text',
    priority: def.priority,
    defaultValue: def.defaultValue,
  };
}

function mergeFieldTokens(fields: Map<string, Set<string>>): WizardField[] {
  return [...fields.entries()]
    .map(([id, tokenSet]) => {
      const def = FIELD_CATALOG.find((f) => f.id === id)!;
      return fieldFromDef(def, [...tokenSet]);
    })
    .sort((a, b) => a.priority - b.priority);
}

/** Build wizard questions from template content (max 5). */
export function extractWizardFields(content: string, templateId?: string): WizardField[] {
  const foundTokens = extractBracketTokens(content);
  const byFieldId = new Map<string, Set<string>>();

  for (const token of foundTokens) {
    const def = catalogEntryForToken(token);
    if (!def) continue;
    const bucket = byFieldId.get(def.id) ?? new Set<string>();
    bucket.add(token);
    byFieldId.set(def.id, bucket);
  }

  let fields = mergeFieldTokens(byFieldId);

  const overrideIds = templateId ? TEMPLATE_WIZARD_FIELDS[templateId] : undefined;
  if (overrideIds?.length) {
    const ordered = overrideIds
      .map((id) => fields.find((f) => f.id === id))
      .filter((f): f is WizardField => Boolean(f));
    const rest = fields.filter((f) => !overrideIds.includes(f.id));
    fields = [...ordered, ...rest];
  }

  if (fields.length === 0) {
    fields = foundTokens.slice(0, MAX_WIZARD_FIELDS).map((token, index) => ({
      id: `custom-${index}`,
      label: token.slice(1, -1),
      tokens: [token],
      type: 'text' as const,
      priority: 100 + index,
    }));
  }

  return fields.slice(0, MAX_WIZARD_FIELDS);
}

export function getDefaultFieldValues(
  fields: WizardField[],
  prefills: Record<string, string> = {},
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (prefills[field.id]?.trim()) {
      values[field.id] = prefills[field.id].trim();
    } else if (field.defaultValue) {
      values[field.id] = field.defaultValue();
    } else {
      values[field.id] = '';
    }
  }
  return values;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace merge tokens in Lexical JSON template content. Empty values leave placeholders. */
export function applyMergeFields(
  content: string,
  fields: WizardField[],
  values: Record<string, string>,
): string {
  let result = content;
  for (const field of fields) {
    const raw = values[field.id]?.trim();
    if (!raw) continue;

    let replacement = raw;
    if (field.type === 'currency') {
      const numeric = raw.replace(/[^0-9.]/g, '');
      replacement = numeric.startsWith('$') ? numeric : `$${numeric || raw}`;
    }

    for (const token of field.tokens) {
      result = result.replace(new RegExp(escapeRegExp(token), 'g'), replacement);
    }
  }
  return result;
}

export function hasMergeFields(content: string): boolean {
  return extractWizardFields(content).length > 0;
}
