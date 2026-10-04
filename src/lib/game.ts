export type Mark = '' | 'X' | 'O';
export type Player = { id: string; username: string };
export type GameMode = 'classic' | 'bombs';
export type Bomb = {cell:number;type:'opponent'|'both'};
export type BombEvent = Bomb & {removed:number[];by:'X'|'O';turn:number};
export type Game = {
  id: string; player_x_id: string; player_o_id: string | null;
  player_x_name: string; player_o_name: string | null;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  board: Mark[]; current_turn: 'X' | 'O'; winner_id: string | null;
  winning_cells: number[]; created_at: string; updated_at: string;
  finished_at: string | null; finish_reason: 'line' | 'draw' | 'resignation' | null;
  mode?:GameMode;move_order?:number[];move_count?:number;bomb_events?:BombEvent[];
};
export const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function outcome(board: Mark[]) {
  const lines=board.length===16?[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],[0,5,10,15],[3,6,9,12]]:LINES;
  for (const cells of lines) {
    if (board[cells[0]] && cells.every(i => board[i] === board[cells[0]]))
      return { winner: board[cells[0]], cells, draw: false };
  }
  return { winner: '' as Mark, cells: [] as number[], draw: board.every(Boolean) };
}
export function move(game: Game, userId: string, cell: number, bombs: Bomb[] = []): Game {
  if (game.status !== 'playing') throw new Error('This game is not accepting moves.');
  const mark = game.player_x_id === userId ? 'X' : game.player_o_id === userId ? 'O' : null;
  if (!mark) throw new Error('You are not a player in this game.');
  if (mark !== game.current_turn) throw new Error('Wait for your turn.');
  if (!Number.isInteger(cell) || cell < 0 || cell >= game.board.length) throw new Error('Choose a valid square.');
  if (game.board[cell]) throw new Error('That square is already occupied.');
  const board = [...game.board]; board[cell] = mark;
  let order=[...(game.move_order || game.board.flatMap((value,index)=>value?[index]:[])),cell];
  const count=movesPlayed(game)+1;
  const events=[...(game.bomb_events || [])];
  const bomb=game.mode==='bombs'?bombs.find(item=>item.cell===cell&&!events.some(event=>event.cell===cell)):undefined;
  if(bomb){
    const removed=bomb.type==='opponent'?order.filter(index=>board[index]!==mark).slice(0,2):(['X','O'] as const).flatMap(symbol=>order.filter(index=>board[index]===symbol).slice(0,2));
    removed.forEach(index=>board[index]='');order=order.filter(index=>!removed.includes(index));
    events.push({...bomb,removed,by:mark,turn:count});
  }
  const result = outcome(board); const done = !!result.winner || result.draw;
  const now = new Date().toISOString();
  return { ...game, board, move_order:order,move_count:count,bomb_events:events,current_turn: mark === 'X' ? 'O' : 'X',
    status: done ? 'finished' : 'playing', winner_id: result.winner ? userId : null,
    winning_cells: result.cells, updated_at: now, finished_at: done ? now : null,
    finish_reason: result.winner ? 'line' : result.draw ? 'draw' : null };
}
export function movesPlayed(game:Game){return game.move_count ?? game.board.filter(Boolean).length;}
export function modeLabel(game:Game){return game.mode==='bombs'?'Bombs · 4×4':'Classic · 3×3';}
export function bombStory(event:BombEvent){return `${event.type==='opponent'?'Rival reset':'Double reset'} triggered on square ${event.cell+1}. ${event.removed.length} ${event.removed.length===1?'mark was':'marks were'} cleared.`;}
export function resultText(game: Game, userId?: string) {
  if (game.status !== 'finished') return 'In progress';
  if (!game.winner_id) return 'Draw';
  if (userId) return game.winner_id === userId ? 'You won' : 'You lost';
  return `${game.winner_id === game.player_x_id ? game.player_x_name : game.player_o_name} won`;
}
export function story(game: Game) {
  const target=game.mode==='bombs'?'four':'three';
  if (!game.winner_id) return `${game.player_x_name} and ${game.player_o_name} filled the board. Neither player found ${target} in a row — a draw.`;
  const winner = game.winner_id === game.player_x_id ? game.player_x_name : game.player_o_name;
  const loser = game.winner_id === game.player_x_id ? game.player_o_name : game.player_x_name;
  return game.finish_reason === 'resignation' ? `${loser} resigned. ${winner} won the match.` : `${winner} completed ${target} in a row in ${movesPlayed(game)} moves. ${winner} won; ${loser} lost.`;
}
