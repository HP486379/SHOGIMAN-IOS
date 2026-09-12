import { useCallback, useEffect, useState } from 'react';
import { CpuLevel, EffectCell, GameState, HandPieces, LastMove, Piece, PieceType, Player, Position } from '../types/shogi';
import { createInitialBoard } from '../utils/initialBoard';
import { moveTouchesPromotionZone, mustPromote } from '../utils/moveRules';
import { chooseCpuMove } from '../utils/cpuPlayer';
import { applyMoveToBoard, canDropPiece, cloneHands, collectLegalMoves, getCheckStatus, getCheckmateWinner, getDropEffects, getLegalMoveEffects } from '../utils/shogiEngine';

const samePos = (a: Position | null, b: Position | null) => Boolean(a && b && a.row === b.row && a.col === b.col);
const randomFirstPlayer = (): Player => Math.random() < 0.5 ? 'black' : 'white';

function createInitialState(cpuLevel: CpuLevel = 'normal'): GameState {
  const firstPlayer = randomFirstPlayer();
  return {
    board: createInitialBoard(), hands: { black: [], white: [] }, selectedPos: null, selectedHandPiece: null,
    effects: [], captureEffect: null, checkPlayer: null, currentPlayer: firstPlayer, firstPlayer, lastMove: null,
    gameOverWinner: null, moveCount: 0, seEnabled: true, cpuLevel, pendingPromotion: null,
  };
}

function addCapturedPiece(hands: HandPieces, player: Player, capturedPiece: Piece | null): HandPieces {
  if (!capturedPiece || capturedPiece.type === 'king') return hands;
  const next = cloneHands(hands); next[player].push(capturedPiece.type); return next;
}

function removeHandPiece(hands: HandPieces, player: Player, type: PieceType): HandPieces {
  const next = cloneHands(hands); const index = next[player].indexOf(type); if (index >= 0) next[player].splice(index, 1); return next;
}

function applyPostMoveState(prev: GameState, board: GameState['board'], hands: HandPieces, nextPlayer: Player, captureEffect: Position | null, lastMove: LastMove): GameState {
  const winner = getCheckmateWinner(board, hands);
  return {
    ...prev, board, hands, selectedPos: null, selectedHandPiece: null, effects: [], captureEffect,
    checkPlayer: winner ? null : getCheckStatus(board), currentPlayer: winner ?? nextPlayer,
    gameOverWinner: winner, pendingPromotion: null, lastMove, moveCount: prev.moveCount + 1,
  };
}

export function useShogi() {
  const [state, setState] = useState<GameState>(() => createInitialState());

  const handleCellClick = useCallback((pos: Position) => {
    setState(prev => {
      if (prev.gameOverWinner || prev.currentPlayer === 'white' || prev.pendingPromotion) return prev;
      const { board, selectedPos, selectedHandPiece, effects, currentPlayer } = prev;
      const clickedPiece = board[pos.row][pos.col];

      if (selectedHandPiece) {
        const valid = effects.some(e => e.position.row === pos.row && e.position.col === pos.col);
        if (!valid || !canDropPiece(board, selectedHandPiece, currentPlayer, pos)) return { ...prev, selectedHandPiece: null, effects: [] };
        const nextBoard = applyMoveToBoard(board, { to: pos, dropPiece: selectedHandPiece, promote: false }, currentPlayer);
        return applyPostMoveState(prev, nextBoard, removeHandPiece(prev.hands, currentPlayer, selectedHandPiece), 'white', null, { from: null, to: pos, player: currentPlayer });
      }

      if (selectedPos && samePos(selectedPos, pos)) return { ...prev, selectedPos: null, effects: [] };
      const effect = effects.find(e => e.position.row === pos.row && e.position.col === pos.col);
      const selectedPiece = selectedPos ? board[selectedPos.row][selectedPos.col] : null;

      if (effect && selectedPos && selectedPiece?.player === currentPlayer) {
        const captured = board[pos.row][pos.col];
        const hands = addCapturedPiece(prev.hands, currentPlayer, captured);
        if (mustPromote(selectedPiece, pos)) {
          const nextBoard = applyMoveToBoard(board, { from: selectedPos, to: pos, promote: true }, currentPlayer);
          return applyPostMoveState(prev, nextBoard, hands, 'white', captured ? pos : null, { from: selectedPos, to: pos, player: currentPlayer });
        }
        if (moveTouchesPromotionZone(selectedPiece, selectedPos, pos)) {
          return { ...prev, hands, selectedPos: null, selectedHandPiece: null, effects: [], captureEffect: captured ? pos : null, pendingPromotion: { from: selectedPos, to: pos } };
        }
        const nextBoard = applyMoveToBoard(board, { from: selectedPos, to: pos, promote: false }, currentPlayer);
        return applyPostMoveState(prev, nextBoard, hands, 'white', captured ? pos : null, { from: selectedPos, to: pos, player: currentPlayer });
      }

      if (clickedPiece?.player === currentPlayer) {
        const newEffects: EffectCell[] = getLegalMoveEffects(board, prev.hands, pos, clickedPiece);
        return { ...prev, selectedPos: pos, selectedHandPiece: null, effects: newEffects };
      }
      return { ...prev, selectedPos: null, effects: [] };
    });
  }, []);

  const selectHandPiece = useCallback((pieceType: PieceType) => {
    setState(prev => {
      if (prev.gameOverWinner || prev.currentPlayer === 'white' || prev.pendingPromotion) return prev;
      const already = prev.selectedHandPiece === pieceType;
      const legalTargets = new Set(collectLegalMoves(prev.board, prev.hands, 'black').filter(move => move.dropPiece === pieceType).map(move => `${move.to.row}-${move.to.col}`));
      return { ...prev, selectedPos: null, selectedHandPiece: already ? null : pieceType, effects: already ? [] : getDropEffects(prev.board, pieceType, 'black').filter(e => legalTargets.has(`${e.position.row}-${e.position.col}`)) };
    });
  }, []);

  const answerPromotion = useCallback((promote: boolean) => {
    setState(prev => {
      if (!prev.pendingPromotion || prev.gameOverWinner) return prev;
      const movingPiece = prev.board[prev.pendingPromotion.from.row][prev.pendingPromotion.from.col];
      const safePromote = movingPiece ? promote || mustPromote(movingPiece, prev.pendingPromotion.to) : promote;
      const nextBoard = applyMoveToBoard(prev.board, { from: prev.pendingPromotion.from, to: prev.pendingPromotion.to, promote: safePromote }, 'black');
      return applyPostMoveState(prev, nextBoard, prev.hands, 'white', prev.captureEffect, { from: prev.pendingPromotion.from, to: prev.pendingPromotion.to, player: 'black' });
    });
  }, []);

  useEffect(() => {
    if (state.gameOverWinner || state.currentPlayer !== 'white' || state.pendingPromotion) return;
    const timer = window.setTimeout(() => {
      setState(prev => {
        if (prev.gameOverWinner || prev.currentPlayer !== 'white' || prev.pendingPromotion) return prev;
        const cpuMove = chooseCpuMove(prev.board, prev.hands, prev.cpuLevel);
        if (!cpuMove) {
          const winner = getCheckmateWinner(prev.board, prev.hands);
          return { ...prev, currentPlayer: winner ?? 'black', gameOverWinner: winner, checkPlayer: winner ? null : getCheckStatus(prev.board) };
        }
        if (cpuMove.dropPiece) {
          const nextBoard = applyMoveToBoard(prev.board, cpuMove, 'white');
          return applyPostMoveState(prev, nextBoard, removeHandPiece(prev.hands, 'white', cpuMove.dropPiece), 'black', null, { from: null, to: cpuMove.to, player: 'white' });
        }
        if (!cpuMove.from) return prev;
        const captured = prev.board[cpuMove.to.row][cpuMove.to.col];
        const nextBoard = applyMoveToBoard(prev.board, cpuMove, 'white');
        return applyPostMoveState(prev, nextBoard, addCapturedPiece(prev.hands, 'white', captured), 'black', captured ? cpuMove.to : null, { from: cpuMove.from, to: cpuMove.to, player: 'white' });
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state.board, state.cpuLevel, state.currentPlayer, state.gameOverWinner, state.hands, state.pendingPromotion]);

  const reset = useCallback(() => setState(prev => createInitialState(prev.cpuLevel)), []);
  const toggleSE = useCallback(() => setState(prev => ({ ...prev, seEnabled: !prev.seEnabled })), []);
  const setCpuLevel = useCallback((cpuLevel: CpuLevel) => setState(prev => ({ ...prev, cpuLevel })), []);

  return { state, handleCellClick, selectHandPiece, answerPromotion, reset, toggleSE, setCpuLevel };
}
