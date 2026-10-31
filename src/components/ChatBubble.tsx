
import type { ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
}

export function ChatBubble({ message }: Props) {
  const { role, content, fadeReason, spellResult, spellId } = message;

  const isFade = role === 'ghost' && !!fadeReason;
  const isSpell = role === 'ghost' && !!spellId;

  let cls = `bubble bubble--${role}`;
  if (isFade) cls += ' bubble--faded';
  if (isSpell) cls += ' bubble--spell';

  return (
    <div className={cls}>
      {role === 'ghost' && (
        <span className="bubble__label" aria-hidden="true">
          {isSpell ? '⚗ SPELL' : '👻 GHOST'}
        </span>
      )}
      {role === 'user' && (
        <span className="bubble__label" aria-hidden="true">YOU</span>
      )}

      <p className="bubble__text">{content}</p>

      {isSpell && spellResult && spellResult.output && (
        <pre className="bubble__spell-output" aria-label="Spell output">
          {spellResult.output}
        </pre>
      )}

      {isSpell && spellResult && spellResult.status !== 'ok' && (
        <p className="bubble__spell-error">
          [{spellResult.status.toUpperCase()}]{spellResult.err ? `: ${spellResult.err}` : ''}
        </p>
      )}
    </div>
  );
}
