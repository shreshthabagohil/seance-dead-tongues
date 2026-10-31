// ============================================================
// Séance: Dead Tongues — shared types
// ============================================================

export type GateVerdict = 'PASS' | 'AMBIG' | 'FADE';

export interface Note {
  id: string;           // N1 … N7
  topic: string;        // canonical topic string
  aliases?: string[];   // extra terms that map to this note
  text: string;         // extractive-answerer body
}

export interface Spell {
  id: string;           // SP-01 … SP-W1
  name: string;         // display name
  description: string;  // one-line description
  source: string;       // SNOBOL4 source code (must include END)
}

export interface ScoredDoc {
  id: string;
  score: number;
  matched: number;
  matchedTerms: string[];
}

export interface QueryResult {
  qs: string[];                 // query stems (post-filter)
  coverage: number;             // fraction of qs matched (NaN if qs=[])
  top: ScoredDoc;               // highest-scoring document
  scored: ScoredDoc[];          // all docs sorted by score desc, id asc
}

export type RouteType = 'BM25_PASS' | 'BM25_AMBIG' | 'OVERVIEW' | 'FADE';

export interface Route {
  type: RouteType;
  notes: Note[];         // notes to use for extraction (1–2)
  queryResult?: QueryResult;
}

export type SpellRunStatus = 'ok' | 'error' | 'limit' | 'timeout';

export interface SpellRunResult {
  spellId: string;
  status: SpellRunStatus;
  output: string;
  err?: string;
}

// Capability probe result
export interface CapabilityResult {
  hasGpu: boolean;
  hasShaderF16: boolean;
  hasStorage: boolean;
  hasModelInCache: boolean;
  blocked: string | null;   // reason why we can't run, or null
}

export type LoadPhase =
  | 'idle'
  | 'probing'
  | 'downloading'    // model weights from HuggingFace
  | 'initializing'   // WebLLM engine setup
  | 'ready'
  | 'error';

export type MessageRole = 'user' | 'ghost' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  spellId?: string;        // set when ghost ran a spell
  spellResult?: SpellRunResult;
  fadeReason?: string;     // set when ghost faded
  ts: number;
}

// App-level state
export type AppStatus =
  | 'boot'           // initial probe
  | 'incompatible'   // GPU/shader-f16 missing
  | 'loading'        // downloading model
  | 'ready'          // chat enabled
  | 'thinking';      // awaiting ghost response

export interface AppState {
  status: AppStatus;
  loadPhase: LoadPhase;
  loadProgress: number;   // 0–100
  messages: ChatMessage[];
  error: string | null;
  conjureCount: number;   // total ghost answers
  acceptCount: number;    // ghost answered (not faded)
  rejectCount: number;    // ghost faded
}

export type AppAction =
  | { type: 'PROBE_DONE'; cap: CapabilityResult }
  | { type: 'LOAD_PROGRESS'; pct: number }
  | { type: 'ENGINE_READY' }
  | { type: 'ENGINE_ERROR'; msg: string }
  | { type: 'USER_MSG'; text: string }
  | { type: 'GHOST_ANSWER'; msg: ChatMessage }
  | { type: 'GHOST_FADE'; reason: string }
  | { type: 'RESET' };
