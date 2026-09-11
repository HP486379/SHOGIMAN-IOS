declare const process: { env: Record<string, string | undefined> };

type Player = 'black' | 'white';
type PieceType = 'king' | 'rook' | 'bishop' | 'gold' | 'silver' | 'knight' | 'lance' | 'pawn';
type AdvisorLanguage = 'ja' | 'en';
type AdvisorTrigger = 'manual' | 'capture' | 'promotion' | 'hq_attack' | 'evaluation_swing' | 'periodic' | 'multiple';

interface PieceInput { type: PieceType; player: Player; promoted?: boolean; }
interface AdvisorRequestBody {
  board: (PieceInput | null)[][];
  hands: Record<Player, PieceType[]>;
  currentPlayer: Player;
  checkPlayer: Player | null;
  lastMovePlayer: Player | null;
  language: AdvisorLanguage;
  trigger: AdvisorTrigger;
}
interface VercelRequest { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; }
interface VercelResponse { status(code: number): VercelResponse; json(body: unknown): void; setHeader(name: string, value: string): void; }
interface AdvisorResult { summary: string; bullets: string[]; }

const PIECE_TYPES = new Set<PieceType>(['king', 'rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn']);
const PLAYERS = new Set<Player>(['black', 'white']);
const TRIGGERS = new Set<AdvisorTrigger>(['manual', 'capture', 'promotion', 'hq_attack', 'evaluation_swing', 'periodic', 'multiple']);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const MIN_INTERVAL_MS = 700;
const rateBuckets = new Map<string, { windowStart: number; count: number; lastAt: number }>();
const UNIT_CODES: Record<PieceType, string> = { king: 'H', rook: 'T', bishop: 'R', gold: 'G', silver: 'S', knight: 'D', lance: 'A', pawn: 'I' };

const SYSTEM_PROMPT = `You are the tactical field advisor in SHOGI FRONTLINE.
Rules are shogi-based, but visible wording must stay inside the military setting.
1P is the human side; CPU is the opponent. Board row 0 is CPU home side, row 8 is 1P home side.
Compact board cells use: p=1P, c=CPU, H=HQ, T=Tank, R=Rocket Launcher, G=Guard, S=Special Forces, D=Drone, A=Artillery, I=Infantry, +=upgraded, .=empty.

Return at most two short sentences total: one summary sentence and optionally one detail sentence. Do not list obvious board inventories or repeat what the UI already shows. Focus only on the most useful tactical implication of the current position.
Never invent a legal move, capture, upgrade, direct HQ attack, or exact unit count. Broad positional advice is preferred.

For Japanese, use only these unit names: 司令部, 戦車, ロケット砲, 近衛兵, 特殊部隊, ドローン, 自走砲, 歩兵. For upgraded units use 強化〜. Never use ordinary shogi terms such as 王, 玉, 飛車, 角, 金, 銀, 桂, 香, 歩 by itself, と金, 馬, 龍, 竜, 成り, 王手, 玉頭, 駒, 持ち駒, 筋, 段. Say 司令部への直接攻撃 instead of 王手, and 予備戦力 instead of 持ち駒.
For English, use only HQ, Tank, Rocket Launcher, Guard, Special Forces, Drone, Artillery, and Infantry for unit names.`;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isPlayer(value: unknown): value is Player { return typeof value === 'string' && PLAYERS.has(value as Player); }
function isPieceType(value: unknown): value is PieceType { return typeof value === 'string' && PIECE_TYPES.has(value as PieceType); }
function isTrigger(value: unknown): value is AdvisorTrigger { return typeof value === 'string' && TRIGGERS.has(value as AdvisorTrigger); }
function isPiece(value: unknown): value is PieceInput | null {
  if (value === null) return true;
  if (!isRecord(value) || !isPieceType(value.type) || !isPlayer(value.player)) return false;
  return value.promoted === undefined || typeof value.promoted === 'boolean';
}
function isAdvisorRequestBody(value: unknown): value is AdvisorRequestBody {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.board) || value.board.length !== 9) return false;
  if (!value.board.every(row => Array.isArray(row) && row.length === 9 && row.every(isPiece))) return false;
  if (!isRecord(value.hands) || !Array.isArray(value.hands.black) || !Array.isArray(value.hands.white)) return false;
  if (value.hands.black.length > 40 || value.hands.white.length > 40) return false;
  if (!value.hands.black.every(isPieceType) || !value.hands.white.every(isPieceType)) return false;
  if (!isPlayer(value.currentPlayer)) return false;
  if (value.checkPlayer !== null && !isPlayer(value.checkPlayer)) return false;
  if (value.lastMovePlayer !== null && !isPlayer(value.lastMovePlayer)) return false;
  if (value.language !== 'ja' && value.language !== 'en') return false;
  return isTrigger(value.trigger);
}
function headerValue(req: VercelRequest, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
function clientIp(req: VercelRequest): string {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerValue(req, 'x-real-ip') ?? 'unknown';
}
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const current = rateBuckets.get(ip);
  if (!current || now - current.windowStart >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { windowStart: now, count: 1, lastAt: now });
    return false;
  }
  if (now - current.lastAt < MIN_INTERVAL_MS || current.count >= RATE_LIMIT) return true;
  current.count += 1;
  current.lastAt = now;
  rateBuckets.set(ip, current);
  return false;
}
function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}
function encodePiece(piece: PieceInput | null): string {
  if (!piece) return '.';
  const side = piece.player === 'black' ? 'p' : 'c';
  return `${side}${UNIT_CODES[piece.type]}${piece.promoted ? '+' : ''}`;
}
function encodeReserve(pieces: PieceType[]): string {
  if (!pieces.length) return '-';
  const counts = pieces.reduce<Record<string, number>>((acc, piece) => {
    const code = UNIT_CODES[piece];
    acc[code] = (acc[code] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([code, count]) => `${code}${count}`).join('');
}
function buildModelInput(body: AdvisorRequestBody): string {
  const turn = body.currentPlayer === 'black' ? '1P' : 'CPU';
  const check = body.checkPlayer === null ? '-' : body.checkPlayer === 'black' ? '1P' : 'CPU';
  const last = body.lastMovePlayer === null ? '-' : body.lastMovePlayer === 'black' ? '1P' : 'CPU';
  const board = body.board.map(row => row.map(encodePiece).join(',')).join('/');
  return `lang=${body.language};trigger=${body.trigger};turn=${turn};hq_under_attack=${check};last=${last};reserve1P=${encodeReserve(body.hands.black)};reserveCPU=${encodeReserve(body.hands.white)};board=${board}`;
}
function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}
function sanitizeAdvice(value: unknown): AdvisorResult | null {
  if (!isRecord(value) || typeof value.summary !== 'string' || !Array.isArray(value.bullets)) return null;
  const summary = value.summary.trim().slice(0, 120);
  const bullets = value.bullets.filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 140)).filter(Boolean).slice(0, 1);
  return summary ? { summary, bullets } : null;
}
function containsForbiddenJapaneseVocabulary(advice: AdvisorResult): boolean {
  const text = [advice.summary, ...advice.bullets].join('\n');
  return /[王玉飛角金銀桂香馬竜龍駒]|歩(?!兵)|成り|[筋段]/.test(text);
}
async function requestAdvice(apiKey: string, input: string, instructions: string, signal: AbortSignal): Promise<AdvisorResult | null> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      store: false,
      instructions,
      input,
      max_output_tokens: 160,
      text: { format: { type: 'json_schema', name: 'shogiman_advice', strict: true, schema: {
        type: 'object', additionalProperties: false,
        properties: {
          summary: { type: 'string', minLength: 1, maxLength: 100 },
          bullets: { type: 'array', minItems: 0, maxItems: 1, items: { type: 'string', minLength: 1, maxLength: 120 } },
        },
        required: ['summary', 'bullets'],
      } } },
    }),
    signal,
  });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  const outputText = extractOutputText(payload);
  if (!outputText) return null;
  try { return sanitizeAdvice(JSON.parse(outputText) as unknown); } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Method not allowed' }); return; }

  const origin = headerValue(req, 'origin');
  const host = headerValue(req, 'host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    } catch { res.status(403).json({ error: 'Origin not allowed' }); return; }
  }

  if (isRateLimited(clientIp(req))) { res.setHeader('Retry-After', '1'); res.status(429).json({ error: 'Too many requests' }); return; }
  const body = parseBody(req.body);
  if (!isAdvisorRequestBody(body) || JSON.stringify(body).length > 24_000) { res.status(400).json({ error: 'Invalid position data' }); return; }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'OPENAI_API_KEY is not configured' }); return; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const modelInput = buildModelInput(body);
    let advice = await requestAdvice(apiKey, modelInput, SYSTEM_PROMPT, controller.signal);
    if (advice && body.language === 'ja' && containsForbiddenJapaneseVocabulary(advice)) {
      const repairPrompt = `${SYSTEM_PROMPT}\nThe previous draft used forbidden shogi vocabulary. Rewrite it in SHOGI FRONTLINE military wording only, still at most two short sentences.`;
      advice = await requestAdvice(apiKey, `${modelInput};rewrite=1`, repairPrompt, controller.signal);
    }
    if (!advice || (body.language === 'ja' && containsForbiddenJapaneseVocabulary(advice))) { res.status(502).json({ error: 'AI advisor returned off-theme advice' }); return; }
    res.status(200).json({ ...advice, model: 'gpt-5.4-mini' });
  } catch {
    res.status(502).json({ error: 'AI advisor is temporarily unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}
