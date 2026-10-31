import { useState } from 'react';
import type { Spell } from '../types';
import { castSpell } from '../spells/runner';

interface Props {
  spells: Spell[];
  onSpellResult: (spellId: string, output: string, status: string) => void;
  disabled: boolean;
}

export function SpellPanel({ spells, onSpellResult, disabled }: Props) {
  const [running, setRunning] = useState<string | null>(null);

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
        Cast a spell to invoke SNOBOL4 directly.
      </p>
      <ul className="spell-list" role="list">
        {spells.map((spell) => (
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
