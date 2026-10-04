export type Mark = '' | 'X' | 'O';
export type Player = { id: string; username: string };
export type Game = {
  id: string; player_x_id: string; player_o_id: string | null;
  player_x_name: string; player_o_name: string | null;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  board: Mark[]; current_turn: 'X' | 'O'; winner_id: string | null;
  winning_cells: number[]; created_at: string; updated_at: string;
  finished_at: string | null; finish_reason: 'line' | 'draw' | 'resignation' | null;
};
export const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function outcome(board: Mark[]) {
  for (const cells of LINES) {
    if (board[cells[0]] && cells.every(i => board[i] === board[cells[0]]))
      return { winner: board[cells[0]], cells, draw: false };
  }
  return { winner: '' as Mark, cells: [] as number[], draw: board.every(Boolean) };
}
export function move(game: Game, userId: string, cell: number): Game {
  if (game.status !== 'playing') throw new Error('This game is not accepting moves.');
  const mark = game.player_x_id === userId ? 'X' : game.player_o_id === userId ? 'O' : null;
  if (!mark) throw new Error('You are not a player in this game.');
  if (mark !== game.current_turn) throw new Error('Wait for your turn.');
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new Error('Choose a valid square.');
  if (game.board[cell]) throw new Error('That square is already occupied.');
  const board = [...game.board]; board[cell] = mark;
  const result = outcome(board); const done = !!result.winner || result.draw;
  const now = new Date().toISOString();
  return { ...game, board, current_turn: mark === 'X' ? 'O' : 'X',
    status: done ? 'finished' : 'playing', winner_id: result.winner ? userId : null,
    winning_cells: result.cells, updated_at: now, finished_at: done ? now : null,
    finish_reason: result.winner ? 'line' : result.draw ? 'draw' : null };
}
export function resultText(game: Game, userId?: string) {
  if (game.status !== 'finished') return 'In progress';
  if (!game.winner_id) return 'Draw';
  if (userId) return game.winner_id === userId ? 'You won' : 'You lost';
  return `${game.winner_id === game.player_x_id ? game.player_x_name : game.player_o_name} won`;
}
export function story(game: Game) {
  if (!game.winner_id) return `${game.player_x_name} and ${game.player_o_name} filled the board. Neither player found three in a row — a draw.`;
  const winner = game.winner_id === game.player_x_id ? game.player_x_name : game.player_o_name;
  const loser = game.winner_id === game.player_x_id ? game.player_o_name : game.player_x_name;
  return game.finish_reason === 'resignation' ? `${loser} resigned. ${winner} won the match.` : `${winner} completed three in a row in ${game.board.filter(Boolean).length} moves. ${winner} won; ${loser} lost.`;
}
