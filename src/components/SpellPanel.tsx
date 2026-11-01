import { useMemo, useState } from 'react';
import type { Spell, SpellLang } from '../types';
import { castSpell } from '../spells/runner';

interface Props {
  spells: Spell[];
  onSpellResult: (spellId: string, output: string, status: string) => void;
  disabled: boolean;
}

const LANG_LABEL: Record<SpellLang, string> = {
  snobol: 'SNOBOL4',
  forth: 'Forth',
};

export function SpellPanel({ spells, onSpellResult, disabled }: Props) {
  const [running, setRunning] = useState<string | null>(null);

  // Only offer a language toggle for languages actually present in the
  // loaded spell list — e.g. if a deploy ships SNOBOL4-only spells.json,
  // the picker simply doesn't render.
  const availableLangs = useMemo(
    () => [...new Set(spells.map((s) => s.lang))] as SpellLang[],
    [spells]
  );
  const [lang, setLang] = useState<SpellLang>(availableLangs[0] ?? 'snobol');
  const visibleSpells = spells.filter((s) => s.lang === lang);

  async function handleCast(spell: Spell) {
    if (running || disabled) return;
    setRunning(spell.id);
    try {
      const result = await castSpell(spell);
      onSpellResult(spell.id, result.output, result.status);
    } finally {
      setRunning(null);
    }
  }

  return (
    <aside className="spell-panel" aria-label="Spell grimoire">
      <h2 className="spell-panel__title">⚗ Grimoire</h2>
      <p className="spell-panel__subtitle">
        Cast a spell to invoke a dead tongue directly.
      </p>

      {availableLangs.length > 1 && (
        <div className="spell-lang-picker" role="radiogroup" aria-label="Spell language">
          {availableLangs.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              className={`spell-lang-btn${lang === l ? ' spell-lang-btn--active' : ''}`}
              onClick={() => setLang(l)}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      )}

      <ul className="spell-list" role="list">
        {visibleSpells.map((spell) => (
          <li key={spell.id} className="spell-item">
            <button
              className="spell-btn"
              onClick={() => handleCast(spell)}
              disabled={disabled || running !== null}
              aria-busy={running === spell.id}
              aria-label={`Cast spell: ${spell.name}`}
            >
              <span className="spell-btn__id">{spell.id}</span>
              <span className="spell-btn__name">{spell.name}</span>
              {running === spell.id && (
                <span className="spell-btn__running" aria-hidden="true">⟳</span>
              )}
            </button>
            <p className="spell-item__desc">{spell.description}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
