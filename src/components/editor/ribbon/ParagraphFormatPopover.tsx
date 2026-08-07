/**
 * ParagraphFormatPopover.tsx
 *
 * A popover panel for paragraph-level formatting:
 *   • Indentation: Left / Right block indent, First Line / Hanging
 *   • Spacing:     Space Before / After paragraph
 *
 * Rendered inside HomeRibbon when the ¶ button is pressed.
 */

import type { ParagraphFormat } from '../../../lib/paragraphFormat';

// ── SpinnerField ──────────────────────────────────────────────────────────────

interface SpinnerFieldProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function SpinnerField({
  label,
  value,
  step = 6,
  min = 0,
  max = 360,
  unit = 'px',
  onChange,
}: SpinnerFieldProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n / step) * step));

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange(clamp(value - step)); }}
          style={spinBtn}
        >−</button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(clamp(+e.target.value))}
          style={spinInput}
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange(clamp(value + step)); }}
          style={spinBtn}
        >+</button>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{unit}</span>
      </div>
    </label>
  );
}

const spinBtn: React.CSSProperties = {
  width: 18, height: 20, padding: 0, border: '1px solid var(--border-color)',
  borderRadius: 3, cursor: 'pointer', fontSize: 13, lineHeight: 1,
  background: 'var(--bg-hover)', color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const spinInput: React.CSSProperties = {
  width: 40, height: 20, textAlign: 'center', border: '1px solid var(--border-color)',
  borderRadius: 3, background: 'var(--bg-surface)', color: 'var(--text-primary)',
  fontSize: 11, padding: '0 2px',
};

// ── ParagraphFormatPopover ────────────────────────────────────────────────────

export type SpecialIndent = 'none' | 'firstLine' | 'hanging';

interface ParagraphFormatPopoverProps {
  value: ParagraphFormat;
  onChange: (partial: Partial<ParagraphFormat>) => void;
}

export function ParagraphFormatPopover({
  value,
  onChange,
}: ParagraphFormatPopoverProps) {
  // Determine the "Special indent" dropdown state
  const special: SpecialIndent =
    value.firstLine > 0 ? 'firstLine' :
    value.firstLine < 0 ? 'hanging'   : 'none';

  const specialAmt = Math.abs(value.firstLine);

  const handleSpecialChange = (newSpecial: SpecialIndent, amt: number) => {
    if (newSpecial === 'none')      onChange({ firstLine: 0 });
    else if (newSpecial === 'firstLine') onChange({ firstLine: Math.abs(amt) });
    else                            onChange({ firstLine: -Math.abs(amt) });
  };

  return (
    <div style={popoverStyle}>
      {/* ── Indentation ────────────────────────────────────────── */}
      <div style={sectionLabel}>INDENTATION</div>

      <div style={row}>
        <SpinnerField
          label="Left"
          value={value.indentLeft}
          min={0} max={360} step={6}
          onChange={v => onChange({ indentLeft: v })}
        />
        <SpinnerField
          label="Right"
          value={value.indentRight}
          min={0} max={360} step={6}
          onChange={v => onChange({ indentRight: v })}
        />
      </div>

      <div style={row}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Special</span>
          <select
            value={special}
            onChange={e => handleSpecialChange(e.target.value as SpecialIndent, specialAmt || 36)}
            style={selectStyle}
          >
            <option value="none">None</option>
            <option value="firstLine">First line</option>
            <option value="hanging">Hanging</option>
          </select>
        </label>

        {special !== 'none' && (
          <SpinnerField
            label="By"
            value={specialAmt}
            min={6} max={360} step={6}
            onChange={amt => handleSpecialChange(special, amt)}
          />
        )}
      </div>

      <div style={divider} />

      {/* ── Spacing ────────────────────────────────────────────── */}
      <div style={sectionLabel}>SPACING</div>

      <div style={row}>
        <SpinnerField
          label="Before"
          value={value.spaceBefore}
          min={0} max={200} step={4}
          onChange={v => onChange({ spaceBefore: v })}
        />
        <SpinnerField
          label="After"
          value={value.spaceAfter}
          min={0} max={200} step={4}
          onChange={v => onChange({ spaceAfter: v })}
        />
      </div>

      {/* ── Quick presets ──────────────────────────────────────── */}
      <div style={divider} />
      <div style={sectionLabel}>PRESETS</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[
          { label: 'No indent',  fmt: { indentLeft: 0, firstLine: 0 } },
          { label: '½″ first',  fmt: { indentLeft: 0, firstLine: 36 } },
          { label: 'Hanging',   fmt: { indentLeft: 36, firstLine: -36 } },
          { label: 'Compact',   fmt: { spaceBefore: 0, spaceAfter: 4 } },
          { label: 'Spaced',    fmt: { spaceBefore: 8, spaceAfter: 8 } },
        ].map(({ label, fmt }) => (
          <button
            key={label}
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(fmt); }}
            style={presetBtn}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Clear ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault();
            onChange({ indentLeft: 0, indentRight: 0, firstLine: 0, spaceBefore: 0, spaceAfter: 0 });
          }}
          style={{ ...presetBtn, width: '100%', justifyContent: 'center' }}
        >
          Clear paragraph formatting
        </button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const popoverStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, zIndex: 200,
  background: 'var(--bg-surface, #1e1e2e)',
  border: '1px solid var(--border-color, #333)',
  borderRadius: 8, padding: 12,
  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  width: 260,
  display: 'flex', flexDirection: 'column', gap: 8,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  color: 'var(--text-secondary)', textTransform: 'uppercase',
};

const row: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-end',
};

const divider: React.CSSProperties = {
  borderTop: '1px solid var(--border-color)', margin: '0 -4px',
};

const selectStyle: React.CSSProperties = {
  height: 22, border: '1px solid var(--border-color)',
  borderRadius: 3, background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 11, padding: '0 4px', width: '100%',
};

const presetBtn: React.CSSProperties = {
  padding: '3px 8px', border: '1px solid var(--border-color)',
  borderRadius: 4, cursor: 'pointer', fontSize: 10,
  background: 'var(--bg-hover)', color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center',
};
