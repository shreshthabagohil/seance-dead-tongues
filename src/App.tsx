import React, { useReducer, useEffect, useRef, useCallback } from 'react';
import type { AppState, AppAction, ChatMessage, CapabilityResult } from './types';
import { MessageList } from './components/MessageList';
import { SpellPanel } from './components/SpellPanel';
import { CapabilityBanner } from './components/CapabilityBanner';
import { ProgressBar } from './components/ProgressBar';
import { probeCapabilities, getEngine } from './llm/engine';
import { initPipeline, ask } from './brain/ask';
import type { Spell } from './types';
import './index.css';

// ── Reducer ───────────────────────────────────────────────────────────────

const INITIAL_STATE: AppState = {
  status: 'boot',
  loadPhase: 'idle',
  loadProgress: 0,
  messages: [
    {
      id: 'intro',
      role: 'ghost',
      content:
        'The séance begins. I am the spirit of SNOBOL4 — ask of pattern, string, and symbol.',
      ts: Date.now(),
    },
  ],
  error: null,
  conjureCount: 0,
  acceptCount: 0,
  rejectCount: 0,
  liteMode: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'PROBE_DONE':
      if (action.cap.blocked) {
        // Lite mode: no WebGPU/shader-f16, but the chat still works —
        // answers come straight from the notes, no model, no download.
        return { ...state, status: 'ready', liteMode: true, loadPhase: 'idle' };
      }
      // Probe passed — wait for user to click Awaken/Summon (PRD FR-2)
      return { ...state, status: 'awaiting_consent', loadPhase: 'idle' };

    case 'START_DOWNLOAD':
      // User clicked — now it's safe to start the download
      return { ...state, status: 'loading', loadPhase: 'downloading' };

    case 'LOAD_PROGRESS':
      return { ...state, loadProgress: action.pct };

    case 'ENGINE_READY':
      return { ...state, status: 'ready', liteMode: false, loadPhase: 'ready', loadProgress: 100 };

    case 'ENGINE_ERROR':
      // The engine failed after the capability probe passed (GPU device
      // lost, model host unreachable, etc.) — fall back to Lite mode
      // instead of a permanent dead end (SECURITY.md runbook C).
      return { ...state, status: 'ready', liteMode: true, error: action.msg, loadPhase: 'idle' };

    case 'FATAL_ERROR':
      // Something failed before the capability probe even ran (e.g.
      // notes.json itself didn't load) — there's no data to answer from,
      // so Lite mode can't help either. This is the one truly dead end.
      return { ...state, status: 'incompatible', error: action.msg, loadPhase: 'idle' };

    case 'USER_MSG': {
      const msg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: 'user',
        content: action.text,
        ts: Date.now(),
      };
      return {
        ...state,
        status: 'thinking',
        messages: [...state.messages, msg],
      };
    }

    case 'GHOST_ANSWER': {
      const isFade = !!action.msg.fadeReason;
      return {
        ...state,
        status: 'ready',
        messages: [...state.messages, action.msg],
        conjureCount: state.conjureCount + 1,
        acceptCount: isFade ? state.acceptCount : state.acceptCount + 1,
        rejectCount: isFade ? state.rejectCount + 1 : state.rejectCount,
      };
    }

    case 'GHOST_FADE': {
      const fadeMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: 'ghost',
        content: 'That memory has faded. The spirit of SNOBOL4 cannot recall that thread of thought.',
        fadeReason: action.reason,
        ts: Date.now(),
      };
      return {
        ...state,
        status: 'ready',
        messages: [...state.messages, fadeMsg],
        conjureCount: state.conjureCount + 1,
        rejectCount: state.rejectCount + 1,
      };
    }

    case 'RESET':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

// ── Meter formula ─────────────────────────────────────────────────────────
function calcMeter(acceptCount: number, rejectCount: number, total: number): number {
  if (total === 0) return 50;
  const acceptRate = acceptCount / total;
  const rejectRate = rejectCount / total;
  return Math.max(0, Math.min(100, Math.round(100 * (0.5 * acceptRate + 0.5 * (1 - rejectRate)))));
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const [spells, setSpells] = React.useState<Spell[]>([]);
  const [capResult, setCapResult] = React.useState<CapabilityResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = React.useState('');

  // Load data + probe capabilities on mount.
  // Engine load does NOT start here — it starts only on user click (PRD FR-2).
  useEffect(() => {
    async function init() {
      // Load notes and spells. If this fails there is no data to answer
      // from at all — Lite mode needs the notes just as much as full mode.
      let notes;
      try {
        const [notesRes, spellsRes] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/notes.json`),
          fetch(`${import.meta.env.BASE_URL}data/spells.json`),
        ]);
        notes = await notesRes.json();
        const spellData: Spell[] = await spellsRes.json();
        setSpells(spellData);
        initPipeline(notes);
      } catch (err) {
        dispatch({ type: 'FATAL_ERROR', msg: String(err) });
        return;
      }

      // Capability probe — sets status to 'awaiting_consent' or 'ready' (lite)
      const cap = await probeCapabilities();
      setCapResult(cap);
      dispatch({ type: 'PROBE_DONE', cap });
    }

    init().catch((err) => {
      dispatch({ type: 'FATAL_ERROR', msg: String(err) });
    });
  }, []);

  // Send user question
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || state.status !== 'ready') return;
    setInputText('');
    dispatch({ type: 'USER_MSG', text });

    try {
      const result = await ask(text, { liteMode: state.liteMode });
      dispatch({ type: 'GHOST_ANSWER', msg: result.message });
    } catch (err) {
      dispatch({ type: 'GHOST_FADE', reason: String(err) });
    }
  }, [inputText, state.status, state.liteMode]);

  // Start model download — called only on explicit user click (PRD FR-2)
  const handleStartDownload = useCallback(async () => {
    dispatch({ type: 'START_DOWNLOAD' });
    try {
      await getEngine((pct) => dispatch({ type: 'LOAD_PROGRESS', pct }));
      dispatch({ type: 'ENGINE_READY' });
    } catch (err) {
      dispatch({ type: 'ENGINE_ERROR', msg: String(err) });
    }
  }, []);

  // Handle spell result from SpellPanel
  const handleSpellResult = useCallback(
    (spellId: string, output: string, status: string) => {
      const spell = spells.find((s) => s.id === spellId);
      const msg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: 'ghost',
        content: spell
          ? `The spell "${spell.name}" has been cast.`
          : `Spell ${spellId} cast.`,
        spellId,
        spellResult: { spellId, status: status as 'ok' | 'error' | 'limit' | 'timeout', output },
        ts: Date.now(),
      };
      dispatch({ type: 'GHOST_ANSWER', msg });
    },
    [spells]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const meter = calcMeter(state.acceptCount, state.rejectCount, state.conjureCount);

  const isReady = state.status === 'ready';
  const isLoading = state.status === 'loading';
  const isIncompatible = state.status === 'incompatible';
  const isAwaitingConsent = state.status === 'awaiting_consent';

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <span aria-hidden="true">👻</span> Séance: Dead Tongues
        </h1>
        <p className="app-subtitle">The ghost of SNOBOL4 awaits your questions.</p>
        {state.conjureCount > 0 && (
          <div className="meter-wrap" aria-label={`Spirit meter: ${meter}%`}>
            <div className="meter-bar">
              <div className="meter-bar__fill" style={{ width: `${meter}%` }} />
            </div>
            <span className="meter-label">Spirit {meter}%</span>
          </div>
        )}
      </header>

      <main className="app-main">
        {isIncompatible && (
          <CapabilityBanner reason={state.error ?? 'Something went wrong loading the séance.'} fatal />
        )}

        {!isIncompatible && state.liteMode && (
          <CapabilityBanner reason={capResult?.blocked ?? state.error ?? 'The model could not be loaded'} />
        )}

        {isAwaitingConsent && (
          <div className="consent-gate">
            <p className="consent-gate__info">
              {capResult?.hasModelInCache
                ? 'Model found in browser cache. Click to load it.'
                : 'Full mode requires downloading ~711 MB. Click when ready.'}
            </p>
            <button className="summon-btn" onClick={handleStartDownload}>
              {capResult?.hasModelInCache ? '👻 Awaken' : '👻 Summon (~711 MB)'}
            </button>
          </div>
        )}

        {isLoading && (
          <ProgressBar
            pct={state.loadProgress}
            label={
              state.loadProgress < 5
                ? 'Summoning Gemma 3 1B… (~711 MB download)'
                : `Loading model… ${state.loadProgress}%`
            }
          />
        )}

        <div className="chat-area">
          <MessageList messages={state.messages} thinking={state.status === 'thinking'} />
        </div>

        <div className="input-row" role="form" aria-label="Ask the ghost">
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady ? 'Ask of pattern, string, and symbol…' : 'The spirit is not yet present…'}
            disabled={!isReady}
            aria-label="Your question"
            maxLength={300}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!isReady || !inputText.trim()}
            aria-label="Send question"
          >
            ↩
          </button>
        </div>
      </main>

      {spells.length > 0 && (
        <SpellPanel
          spells={spells}
          onSpellResult={handleSpellResult}
          disabled={!isReady}
        />
      )}

      <footer className="app-footer">
        <p>
          Offline • WebGPU • Gemma 3 1B •{' '}
          <a href="https://github.com/shreshthabagohil/seance-dead-tongues" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>{' '}
          •{' '}
          <a href="https://devpost.com" target="_blank" rel="noopener noreferrer">
            DEV Week 4
          </a>
        </p>
      </footer>
    </div>
  );
}
