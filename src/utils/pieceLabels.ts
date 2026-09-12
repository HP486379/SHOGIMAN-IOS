import { Piece, PieceType } from '../types/shogi';

export const PIECE_KANJI: Record<PieceType, string> = {
  king: '玉', rook: '飛', bishop: '角', gold: '金', silver: '銀', knight: '桂', lance: '香', pawn: '歩',
};

export const PROMOTED_KANJI: Partial<Record<PieceType, string>> = {
  rook: '龍', bishop: '馬', silver: '全', knight: '圭', lance: '杏', pawn: 'と',
};

export const UNIT_CODE: Record<PieceType, string> = {
  king: 'HQ', rook: 'TNK', bishop: 'RKT', gold: 'GRD', silver: 'SPC', knight: 'DRN', lance: 'ART', pawn: 'INF',
};

export const UNIT_NAME_JA: Record<PieceType, string> = {
  king: '司令部', rook: '戦車', bishop: 'ロケット砲', gold: '近衛兵', silver: '特殊部隊', knight: 'ドローン', lance: '自走砲', pawn: '歩兵',
};

export const UNIT_NAME_EN: Record<PieceType, string> = {
  king: 'HEADQUARTERS', rook: 'TANK', bishop: 'ROCKET LAUNCHER', gold: 'GUARD', silver: 'SPECIAL FORCES', knight: 'DRONE', lance: 'ARTILLERY', pawn: 'INFANTRY',
};

export function getPieceKanji(piece: Piece): string {
  return piece.promoted ? PROMOTED_KANJI[piece.type] ?? PIECE_KANJI[piece.type] : PIECE_KANJI[piece.type];
}
