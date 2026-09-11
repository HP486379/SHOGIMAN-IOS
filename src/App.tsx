import { CSSProperties, useMemo, useState } from 'react';
import { getPieceTypeIcon, getUnitIcon } from './assets/unitIcons';
import { useShogi } from './hooks/useShogi';
import { CpuLevel, DisplayMode, Piece, PieceType, Position } from './types/shogi';
import { getPieceKanji, PIECE_KANJI, UNIT_CODE, UNIT_NAME_EN, UNIT_NAME_JA } from './utils/pieceLabels';

type Sheet = 'ai' | 'guide' | 'settings' | null;

const PIECE_ORDER: PieceType[] = ['pawn', 'lance', 'knight', 'silver', 'gold', 'bishop', 'rook', 'king'];

function samePos(a: Position | null, row: number, col: number) {
  return Boolean(a && a.row === row && a.col === col);
}

function groupHand(hand: PieceType[]) {
  return PIECE_ORDER.map(type => ({ type, count: hand.filter(item => item === type).length })).filter(item => item.count > 0);
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
            <img src={getPieceTypeIcon(type)} alt="" />
            <span>{UNIT_CODE[type]}</span>
            <b>×{count}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function MiniGuide({ piece, pos }: { piece: Piece; pos: Position }) {
  const left = Math.min(82, Math.max(18, ((pos.col + 0.5) / 9) * 100));
  const below = pos.row <= 3;
  const style = { '--guide-left': `${left}%`, '--guide-row': pos.row } as CSSProperties;
  return (
    <div className={`mini-guide ${below ? 'mini-guide-below' : 'mini-guide-above'}`} style={style} aria-live="polite">
      <img src={getUnitIcon(piece)} alt="" />
      <div className="mini-guide-copy">
        <strong>{getPieceKanji(piece)} / {UNIT_CODE[piece.type]}</strong>
        <span>{piece.promoted ? `強化${UNIT_NAME_JA[piece.type]}` : UNIT_NAME_JA[piece.type]}</span>
        <small>{UNIT_NAME_EN[piece.type]}</small>
      </div>
    </div>
  );
}

function Board({ mode, inspected, onInspect }: {
  mode: DisplayMode;
  inspected: Position | null;
  onInspect: (pos: Position) => void;
}) {
  const { state, handleCellClick } = useShogiContext();
  const inspectedPiece = inspected ? state.board[inspected.row][inspected.col] : null;

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
          return (
            <button
              type="button"
              role="gridcell"
              className={`board-cell ${effect ? `effect-${effect.kind}` : ''} ${selected ? 'selected' : ''} ${last ? 'last-move' : ''}`}
              key={`${rowIndex}-${colIndex}`}
              onClick={() => onCell(rowIndex, colIndex)}
            >
              {piece && (
                <span className={`piece-face ${piece.player === 'white' ? 'cpu-piece' : 'player-piece'} ${mode}`}>
                  {mode === 'military' ? <img src={getUnitIcon(piece)} alt="" draggable={false} /> : <span className="shogi-kanji">{getPieceKanji(piece)}</span>}
                  {mode === 'military' && <span className="piece-code">{UNIT_CODE[piece.type]}</span>}
                  {piece.promoted && mode === 'military' && <span className="upgrade-mark">UP</span>}
                </span>
              )}
              {last && <span className="last-dot" />}
            </button>
          );
        }))}
      </div>
      {inspectedPiece && inspected && inspected.row >= 0 && <MiniGuide piece={inspectedPiece} pos={inspected} />}
    </div>
  );
}

let shogiContext: ReturnType<typeof useShogi> | null = null;
function useShogiContext() {
  if (!shogiContext) throw new Error('Shogi context not initialized');
  return shogiContext;
}

function SheetPanel({ sheet, onClose, mode, setMode }: {
  sheet: Exclude<Sheet, null>;
  onClose: () => void;
  mode: DisplayMode;
  setMode: (mode: DisplayMode) => void;
}) {
  const { state, reset, toggleSE, setCpuLevel } = useShogiContext();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="bottom-sheet" onClick={event => event.stopPropagation()}>
        <div className="sheet-handle" />
        {sheet === 'ai' && (
          <>
            <div className="sheet-heading"><span>AI TACTIC ADVISOR</span><button onClick={onClose}>×</button></div>
            <div className="advisor-state">STANDBY <b>BALANCED</b></div>
            <p className="advisor-copy">重要局面では盤面上に短い通信を表示します。GPT-5.4 mini のイベント駆動連携は次の実装フェーズで接続します。</p>
            <button className="primary-action" disabled>ANALYZE — API LINK NEXT</button>
          </>
        )}
        {sheet === 'guide' && (
          <>
            <div className="sheet-heading"><span>UNIT GUIDE</span><button onClick={onClose}>×</button></div>
            <div className="guide-grid">
              {PIECE_ORDER.map(type => (
                <article className="guide-card" key={type}>
                  <img src={getPieceTypeIcon(type)} alt="" />
                  <div><strong>{PIECE_KANJI[type]} / {UNIT_CODE[type]}</strong><span>{UNIT_NAME_JA[type]}</span><small>{UNIT_NAME_EN[type]}</small></div>
                </article>
              ))}
            </div>
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
  const [mode, setMode] = useState<DisplayMode>('military');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [inspected, setInspected] = useState<Position | null>(null);

  const score = useMemo(() => String(state.moveCount * 100).padStart(6, '0'), [state.moveCount]);
  const turn = state.currentPlayer === 'black' ? '1P' : 'CPU';
  const normalizedInspected = inspected && inspected.row >= 0 ? inspected : null;

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

      {state.checkPlayer === 'black' && <div className="radio-alert">⚡ TACTIC ALERT · HQ UNDER DIRECT ATTACK</div>}
      {state.gameOverWinner && <div className="radio-alert victory">{state.gameOverWinner === 'black' ? 'MISSION COMPLETE · 1P VICTORY' : 'MISSION FAILED · CPU VICTORY'}</div>}

      <nav className="bottom-nav" aria-label="Battle tools">
        <button onClick={() => setSheet('ai')}><span>◆</span>AI</button>
        <button onClick={() => setSheet('guide')}><span>▣</span>GUIDE</button>
        <button onClick={() => setSheet('settings')}><span>⚙</span>SET</button>
      </nav>

      {state.pendingPromotion && (
        <div className="promotion-backdrop">
          <div className="promotion-dialog"><strong>UNIT UPGRADE?</strong><span>敵陣で強化可能です。</span><div><button onClick={() => answerPromotion(true)}>UPGRADE</button><button onClick={() => answerPromotion(false)}>KEEP</button></div></div>
        </div>
      )}
      {sheet && <SheetPanel sheet={sheet} onClose={() => setSheet(null)} mode={mode} setMode={setMode} />}
    </main>
  );
}
