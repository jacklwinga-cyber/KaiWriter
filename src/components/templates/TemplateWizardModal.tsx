import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import type { DocumentTemplate } from '../../data/templates';
import {
  applyMergeFields,
  extractWizardFields,
  getDefaultFieldValues,
  type WizardField,
} from '../../lib/mergeFields';
import styles from './TemplateWizardModal.module.css';

interface TemplateWizardModalProps {
  isOpen: boolean;
  template: DocumentTemplate | null;
  displayName?: string;
  onClose: () => void;
  onSkip: () => void;
  onComplete: (content: string, documentName: string) => void;
}

export function TemplateWizardModal({
  isOpen,
  template,
  displayName,
  onClose,
  onSkip,
  onComplete,
}: TemplateWizardModalProps) {
  const fields = useMemo(
    () => (template ? extractWizardFields(template.content, template.id) : []),
    [template],
  );

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !template) return;
    setValues(getDefaultFieldValues(fields, {
      yourName: displayName ?? '',
    }));
  }, [isOpen, template, fields, displayName]);

  if (!isOpen || !template) return null;

  const updateField = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleCreate = () => {
    const merged = applyMergeFields(template.content, fields, values);
    onComplete(merged, template.defaultDocumentName);
  };

  const filledCount = fields.filter((f) => values[f.id]?.trim()).length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Template wizard</p>
            <h2 className={styles.title}>{template.name}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.intro}>
            Answer a few quick questions and we&apos;ll fill in the placeholders for you.
            Leave any field blank to keep the placeholder in the document.
          </p>

          <div className={styles.fields}>
            {fields.map((field) => (
              <WizardFieldInput
                key={field.id}
                field={field}
                value={values[field.id] ?? ''}
                onChange={(value) => updateField(field.id, value)}
              />
            ))}
          </div>

          {fields.length === 0 && (
            <p className={styles.emptyHint}>No merge fields detected — you can edit placeholders in the editor.</p>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.skipBtn} onClick={onSkip}>
            Skip — use placeholders
          </button>
          <button type="button" className={styles.createBtn} onClick={handleCreate}>
            <Sparkles size={16} />
            Create document
            {filledCount > 0 && <span className={styles.filledBadge}>{filledCount} filled</span>}
            <ArrowRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  );
}

function WizardFieldInput({
  field,
  value,
  onChange,
}: {
  field: WizardField;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputType = field.type === 'date' ? 'date' : field.type === 'currency' ? 'text' : 'text';

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{field.label}</span>
      <input
        type={inputType}
        className={styles.fieldInput}
        value={field.type === 'date' && value.includes(',')
          ? toInputDate(value)
          : value}
        placeholder={field.type === 'currency' ? '$0.00' : `Enter ${field.label.toLowerCase()}`}
        onChange={(e) => {
          const next = field.type === 'date' && e.target.type === 'date'
            ? fromInputDate(e.target.value)
            : e.target.value;
          onChange(next);
        }}
      />
      {field.tokens.length > 0 && (
        <span className={styles.fieldHint}>Replaces {field.tokens.slice(0, 2).join(', ')}{field.tokens.length > 2 ? '…' : ''}</span>
      )}
    </label>
  );
}

function toInputDate(display: string): string {
  const parsed = Date.parse(display);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function fromInputDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
