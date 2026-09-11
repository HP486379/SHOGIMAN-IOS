import { CSSProperties, useMemo, useState } from 'react';
import { getBattlefieldPieceTypeIcon, getBattlefieldUnitIcon } from './assets/battlefieldUnitIcons';
import { UNIT_GUIDE_PANEL_IMAGE } from './assets/unitGuidePanelImage';
import { useMobileAdvisor } from './hooks/useMobileAdvisor';
import { useShogi } from './hooks/useShogi';
import { CpuLevel, DisplayMode, EffectKind, Piece, PieceType, Position } from './types/shogi';
import { getPieceKanji, UNIT_CODE } from './utils/pieceLabels';

type Sheet = 'ai' | 'guide' | 'settings' | null;
type MobileAdvisor = ReturnType<typeof useMobileAdvisor>;

const PIECE_ORDER: PieceType[] = ['pawn', 'lance', 'knight', 'silver', 'gold', 'bishop', 'rook', 'king'];
const GUIDE_CROP_WIDTH = 44.9;
const GUIDE_CROP_HEIGHT = 18.9;

const GUIDE_REGION: Record<PieceType, { left: number; top: number }> = {
  pawn: { left: 5.1, top: 15.9 },
  lance: { left: 51.4, top: 15.9 },
  knight: { left: 5.1, top: 36.2 },
  silver: { left: 51.4, top: 36.2 },
  gold: { left: 5.1, top: 56.4 },
  bishop: { left: 51.4, top: 56.4 },
  rook: { left: 5.1, top: 76.7 },
  king: { left: 51.4, top: 76.7 },
};

function samePos(a: Position | null, row: number, col: number) {
  return Boolean(a && a.row === row && a.col === col);
}

function groupHand(hand: PieceType[]) {
  return PIECE_ORDER.map(type => ({ type, count: hand.filter(item => item === type).length })).filter(item => item.count > 0);
}

function effectSymbol(kind: EffectKind) {
  if (kind === 'capture') return '✕';
  if (kind === 'cross') return '╋';
  if (kind === 'diagonal') return '✦';
  return '◆';
}

function GuideArtwork({ type, className = '' }: { type: PieceType; className?: string }) {
  const region = GUIDE_REGION[type];
  const imageStyle: CSSProperties = {
    width: `${10000 / GUIDE_CROP_WIDTH}%`,
    left: `${-(region.left / GUIDE_CROP_WIDTH) * 100}%`,
    top: `${-(region.top / GUIDE_CROP_HEIGHT) * 100}%`,
  };

  return (
    <span className={`guide-art-crop ${className}`} aria-hidden="true">
      <img className="guide-art-source" src={UNIT_GUIDE_PANEL_IMAGE} style={imageStyle} alt="" draggable={false} />
    </span>
  );
}

function HandBar({ title, hand, cpu, selected, onSelect }: {
  title: string;
  hand: PieceType[];
  cpu?: boolean;
  selected?: PieceType | null;
  onSelect?: (type: PieceType) => void;
}) {
  const groups = groupHand(hand);
  return (
    <section className={`hand-bar ${cpu ? 'hand-bar-cpu' : 'hand-bar-player'}`}>
      <div className="hand-title">{title}</div>
      <div className="hand-pieces">
        {groups.length === 0 ? <span className="hand-empty">EMPTY</span> : groups.map(({ type, count }) => (
          <button
            key={type}
            type="button"
            className={`hand-chip ${selected === type ? 'selected' : ''}`}
            onClick={() => onSelect?.(type)}
            disabled={!onSelect}
          >
            <img src={getBattlefieldPieceTypeIcon(type)} alt="" />
            <span>{UNIT_CODE[type]}</span>
            <b>×{count}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function MiniGuide({ piece, pos }: { piece: Piece; pos: Position }) {
  const left = Math.min(76, Math.max(24, ((pos.col + 0.5) / 9) * 100));
  const below = pos.row <= 3;
  const edge = below ? ((pos.row + 1.12) / 9) * 100 : ((9 - pos.row + 0.12) / 9) * 100;
  const style: CSSProperties = below
    ? { left: `${left}%`, top: `${edge}%` }
    : { left: `${left}%`, bottom: `${edge}%` };

  return (
    <div className={`mini-guide mini-guide-original ${below ? 'mini-guide-below' : 'mini-guide-above'}`} style={style} aria-live="polite">
      <GuideArtwork type={piece.type} className="mini-guide-art" />
      {piece.promoted && <span className="mini-guide-upgrade">UPGRADED</span>}
    </div>
  );
}

function Board({ mode, inspected, onInspect }: {
  mode: DisplayMode;
  inspected: Position | null;
  onInspect: (pos: Position) => void;
}) {
  const { state, handleCellClick } = useShogiContext();
  const inspectedPiece = inspected ? state.board[inspected.row]?.[inspected.col] ?? null : null;

  function onCell(row: number, col: number) {
    const piece = state.board[row][col];
    const isEffect = state.effects.some(effect => effect.position.row === row && effect.position.col === col);
    if (isEffect || state.selectedHandPiece || !piece || piece.player === 'black') handleCellClick({ row, col });
    onInspect(isEffect || !piece ? { row: -1, col: -1 } : { row, col });
  }

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="9 x 9 shogi board">
        {state.board.map((row, rowIndex) => row.map((piece, colIndex) => {
          const effect = state.effects.find(item => item.position.row === rowIndex && item.position.col === colIndex);
          const selected = samePos(state.selectedPos, rowIndex, colIndex);
          const last = samePos(state.lastMove?.to ?? null, rowIndex, colIndex);
          const captureExplosion = samePos(state.captureEffect, rowIndex, colIndex);
          return (
            <button
              type="button"
              role="gridcell"
              className={`board-cell ${effect ? `effect-${effect.kind} legal-target` : ''} ${selected ? 'selected' : ''} ${last ? 'last-move' : ''}`}
              key={`${rowIndex}-${colIndex}`}
              onClick={() => onCell(rowIndex, colIndex)}
            >
              {effect && <span className={`effect-marker ${effect.kind}`}>{effectSymbol(effect.kind)}</span>}
              {captureExplosion && (
                <span className="bomb-explosion" aria-hidden="true">
                  <span className="bomb-core">●</span>
                  <span className="bomb-spark spark-1">✹</span>
                  <span className="bomb-spark spark-2">✸</span>
                  <span className="bomb-spark spark-3">✹</span>
                </span>
              )}
              {piece && (
                <span className={`piece-face ${piece.player === 'white' ? 'cpu-piece' : 'player-piece'} ${mode}`}>
                  {mode === 'military' ? <img src={getBattlefieldUnitIcon(piece)} alt="" draggable={false} /> : <span className="shogi-kanji">{getPieceKanji(piece)}</span>}
                  {mode === 'military' && <span className="piece-code">{UNIT_CODE[piece.type]}</span>}
                  {piece.promoted && mode === 'military' && <span className="upgrade-mark">UP</span>}
                </span>
              )}
              {last && <span className="last-dot" />}
            </button>
          );
        }))}
      </div>
      {inspectedPiece && inspected && <MiniGuide piece={inspectedPiece} pos={inspected} />}
    </div>
  );
}

let shogiContext: ReturnType<typeof useShogi> | null = null;
function useShogiContext() {
  if (!shogiContext) throw new Error('Shogi context not initialized');
  return shogiContext;
}

function FullGuide({ activeType }: { activeType: PieceType | null }) {
  const activeRegion = activeType ? GUIDE_REGION[activeType] : null;
  return (
    <div className="full-guide-image-wrap">
      <img className="full-guide-image" src={UNIT_GUIDE_PANEL_IMAGE} alt="UNIT GUIDE 駒対応図" draggable={false} />
      {activeRegion && (
        <span
          className="full-guide-highlight"
          style={{
            left: `${activeRegion.left}%`,
            top: `${activeRegion.top}%`,
            width: `${GUIDE_CROP_WIDTH}%`,
            height: `${GUIDE_CROP_HEIGHT}%`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function SheetPanel({ sheet, onClose, mode, setMode, advisor, activeGuideType }: {
  sheet: Exclude<Sheet, null>;
  onClose: () => void;
  mode: DisplayMode;
  setMode: (mode: DisplayMode) => void;
  advisor: MobileAdvisor;
  activeGuideType: PieceType | null;
}) {
  const { state, reset, toggleSE, setCpuLevel } = useShogiContext();
  const sourceLabel = advisor.source === 'loading' ? 'ANALYZING...' : advisor.source === 'openai' ? 'GPT-5.4 MINI' : advisor.source === 'error' ? 'API ERR' : 'STANDBY';
  const canAnalyze = state.currentPlayer === 'black' && !state.pendingPromotion && advisor.source !== 'loading';
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="bottom-sheet" onClick={event => event.stopPropagation()}>
        <div className="sheet-handle" />
        {sheet === 'ai' && (
          <>
            <div className="sheet-heading"><span>AI TACTIC ADVISOR</span><button onClick={onClose}>×</button></div>
            <div className="advisor-state">{sourceLabel} <b>{advisor.evaluation}</b></div>
            {advisor.latestAdvice ? (
              <div className="advisor-copy advisor-result">
                <p>{advisor.latestAdvice.summary}</p>
                {advisor.latestAdvice.bullets[0] && <p>{advisor.latestAdvice.bullets[0]}</p>}
              </div>
            ) : (
              <p className="advisor-copy">重要な局面変化を検知した時だけAI参謀が自動介入します。必要ならANALYZEで現在局面を確認できます。</p>
            )}
            <button className="primary-action" disabled={!canAnalyze} onClick={advisor.analyze}>{advisor.source === 'loading' ? 'ANALYZING...' : 'ANALYZE'}</button>
          </>
        )}
        {sheet === 'guide' && (
          <>
            <div className="sheet-heading"><span>UNIT GUIDE</span><button onClick={onClose}>×</button></div>
            <FullGuide activeType={activeGuideType} />
          </>
        )}
        {sheet === 'settings' && (
          <>
            <div className="sheet-heading"><span>SETTINGS</span><button onClick={onClose}>×</button></div>
            <div className="setting-row"><span>DISPLAY</span><div className="segmented"><button className={mode === 'military' ? 'active' : ''} onClick={() => setMode('military')}>MILITARY</button><button className={mode === 'shogi' ? 'active' : ''} onClick={() => setMode('shogi')}>SHOGI</button></div></div>
            <div className="setting-row"><span>CPU LEVEL</span><div className="segmented">{(['easy','normal','hard'] as CpuLevel[]).map(level => <button key={level} className={state.cpuLevel === level ? 'active' : ''} onClick={() => setCpuLevel(level)}>{level.toUpperCase()}</button>)}</div></div>
            <div className="setting-row"><span>SOUND</span><button className="outline-action" onClick={toggleSE}>{state.seEnabled ? 'SE: ON' : 'SE: OFF'}</button></div>
            <button className="danger-action" onClick={() => { reset(); onClose(); }}>RESET BATTLE</button>
          </>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const game = useShogi();
  shogiContext = game;
  const { state, selectHandPiece, answerPromotion, setCpuLevel } = game;
  const advisor = useMobileAdvisor(state);
  const [mode, setMode] = useState<DisplayMode>('military');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [inspected, setInspected] = useState<Position | null>(null);

  const score = useMemo(() => String(state.moveCount * 100).padStart(6, '0'), [state.moveCount]);
  const turn = state.currentPlayer === 'black' ? '1P' : 'CPU';
  const normalizedInspected = inspected && inspected.row >= 0 ? inspected : null;
  const inspectedPiece = normalizedInspected ? state.board[normalizedInspected.row]?.[normalizedInspected.col] ?? null : null;
  const selectedBoardPiece = state.selectedPos ? state.board[state.selectedPos.row]?.[state.selectedPos.col] ?? null : null;
  const activeGuideType = state.selectedHandPiece ?? inspectedPiece?.type ?? selectedBoardPiece?.type ?? null;

  function openAi() {
    advisor.markRead();
    advisor.dismissTransmission();
    setSheet('ai');
  }

  return (
    <main className="ios-shell">
      <header className="battle-controls">
        <div className="control-row"><span className="control-label">MODE</span><div className="segmented top-segment"><button className={mode === 'military' ? 'active' : ''} onClick={() => setMode('military')}>MILITARY</button><button className={mode === 'shogi' ? 'active' : ''} onClick={() => setMode('shogi')}>SHOGI</button></div></div>
        <div className="control-row"><span className="control-label">CPU</span><div className="segmented top-segment">{(['easy','normal','hard'] as CpuLevel[]).map(level => <button key={level} className={state.cpuLevel === level ? 'active' : ''} onClick={() => setCpuLevel(level)}>{level.toUpperCase()}</button>)}</div></div>
        <div className="status-row"><span>TURN <b>{turn}</b></span><span>MOVES <b>{String(state.moveCount).padStart(3, '0')}</b></span><span>SCORE <b>{score}</b></span></div>
      </header>

      <section className="play-zone">
        <HandBar title="CPU CAPTURED" hand={state.hands.white} cpu />
        <div className={`turn-banner ${state.currentPlayer === 'black' ? 'player-turn' : 'cpu-turn'}`}>{state.currentPlayer === 'black' ? '▼ 1P SENTE' : '▲ CPU SENTE'} · {state.cpuLevel.toUpperCase()}</div>
        <Board mode={mode} inspected={normalizedInspected} onInspect={setInspected} />
        <div className="gate-meter">▽ 1P GOTE ▰▰▰▰▰▰ 100%</div>
        <HandBar title="1P CAPTURED" hand={state.hands.black} selected={state.selectedHandPiece} onSelect={selectHandPiece} />
      </section>

      {advisor.transmission && (
        <div className="tactic-transmission" role="status" aria-live="polite" onClick={openAi}>
          <div className="transmission-head"><span>⚡ TACTIC ADVISOR</span><b>{advisor.evaluation}</b></div>
          <p>{advisor.transmission.summary}</p>
          {advisor.transmission.bullets[0] && <p>{advisor.transmission.bullets[0]}</p>}
          <small>TAP TO OPEN · AUTO CLOSE</small>
        </div>
      )}

      {state.checkPlayer === 'black' && <div className="radio-alert">⚡ TACTIC ALERT · HQ UNDER DIRECT ATTACK</div>}
      {state.gameOverWinner && <div className="radio-alert victory">{state.gameOverWinner === 'black' ? 'MISSION COMPLETE · 1P VICTORY' : 'MISSION FAILED · CPU VICTORY'}</div>}

      <nav className="bottom-nav" aria-label="Battle tools">
        <button onClick={openAi} className={advisor.unread ? 'has-unread' : ''}><span>◆</span>AI{advisor.unread && <i className="unread-dot" />}</button>
        <button onClick={() => setSheet('guide')}><span>▣</span>GUIDE</button>
        <button onClick={() => setSheet('settings')}><span>⚙</span>SET</button>
      </nav>

      {state.pendingPromotion && (
        <div className="promotion-backdrop">
          <div className="promotion-dialog"><strong>UNIT UPGRADE?</strong><span>敵陣で強化可能です。</span><div><button onClick={() => answerPromotion(true)}>UPGRADE</button><button onClick={() => answerPromotion(false)}>KEEP</button></div></div>
        </div>
      )}
      {sheet && <SheetPanel sheet={sheet} onClose={() => setSheet(null)} mode={mode} setMode={setMode} advisor={advisor} activeGuideType={activeGuideType} />}
    </main>
  );
}
