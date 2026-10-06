import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, randomInt, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { move, type Bomb, type Game, type GameMode, type Player } from './game';

export type Snapshot = { user: Player; challenges: Game[]; active: Game | null; history: Game[]; stats: { wins: number; losses: number; draws: number }; onlineIds: string[] };
type UserRow = Player & { password: string; salt: string };
type DbGame = Omit<Game, 'board' | 'winning_cells' | 'mode' | 'move_order' | 'move_count' | 'bomb_events'> & { board: string; winning_cells: string; metadata?:string };
export class LocalStore {
  db: DatabaseSync;
  listeners = new Set<() => void>();
  constructor(path = process.env.QALIM_DB_PATH || join(process.cwd(), '.data', 'qalim.sqlite')) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, salt TEXT NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, player_x_id TEXT NOT NULL REFERENCES users(id), player_o_id TEXT REFERENCES users(id), player_x_name TEXT NOT NULL, player_o_name TEXT, status TEXT NOT NULL, board TEXT NOT NULL, current_turn TEXT NOT NULL, winner_id TEXT, winning_cells TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, finish_reason TEXT);
      CREATE INDEX IF NOT EXISTS games_status ON games(status);
      CREATE INDEX IF NOT EXISTS games_x ON games(player_x_id);
      CREATE INDEX IF NOT EXISTS games_o ON games(player_o_id);`);
    if(!(this.db.prepare('PRAGMA table_info(games)').all() as {name:string}[]).some(column=>column.name==='metadata'))this.db.exec("ALTER TABLE games ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
    this.db.exec('CREATE TABLE IF NOT EXISTS game_bombs(game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,cell INTEGER NOT NULL,type TEXT NOT NULL,PRIMARY KEY(game_id,cell))');
  }
  notify() { this.listeners.forEach(fn => fn()); }
  atomic<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); this.notify(); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  register(email: string, password: string, username: string): { user: Player; token: string } {
    email = email.trim().toLowerCase(); username = username.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
    if (password.length < 8 || password.length > 128) throw new Error('Use a password with 8–128 characters.');
    if (username.length < 2 || username.length > 24) throw new Error('Your player name must be 2–24 characters.');
    const salt = randomBytes(16).toString('hex'); const hash = scryptSync(password, salt, 64).toString('hex');
    const user = { id: randomUUID(), username };
    try { this.db.prepare('INSERT INTO users(id,username,email,password,salt,last_seen) VALUES(?,?,?,?,?,?)').run(user.id, username, email, hash, salt, Date.now()); }
    catch { throw new Error('Unable to create account. Try another email or sign in.'); }
    return { user, token: this.session(user.id) };
  }
  login(email: string, password: string) {
    if (password.length > 128) throw new Error('Email or password is incorrect.');
    const row = this.db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase()) as UserRow | undefined;
    const actual = scryptSync(password, row?.salt || 'dummy-salt', 64);
    if (!row || !timingSafeEqual(actual, Buffer.from(row.password, 'hex'))) throw new Error('Email or password is incorrect.');
    return { user: { id: row.id, username: row.username }, token: this.session(row.id) };
  }
  session(userId: string) {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(this.hash(token), userId, Date.now() + 7*86400000);
    return token;
  }
  hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  user(token: string) {
    const row = this.db.prepare('SELECT u.id,u.username FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(this.hash(token), Date.now()) as Player | undefined;
    return row ? { ...row } : undefined;
  }
  logout(token: string) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(this.hash(token)); }
  decode(row: DbGame): Game { const {metadata,...game}=row;return { ...game,...JSON.parse(metadata||'{}'),board: JSON.parse(row.board), winning_cells: JSON.parse(row.winning_cells) }; }
  game(id: string): Game { const row = this.db.prepare('SELECT * FROM games WHERE id=?').get(id) as DbGame | undefined; if (!row) throw new Error('This challenge no longer exists.'); return this.decode(row); }
  active(userId: string): Game | null {
    const row = this.db.prepare("SELECT * FROM games WHERE status IN ('waiting','playing') AND (player_x_id=? OR player_o_id=?) ORDER BY created_at DESC LIMIT 1").get(userId, userId) as DbGame | undefined;
    return row ? this.decode(row) : null;
  }
  save(g: Game) {
    this.db.prepare('UPDATE games SET player_o_id=?,player_o_name=?,status=?,board=?,current_turn=?,winner_id=?,winning_cells=?,updated_at=?,finished_at=?,finish_reason=?,metadata=? WHERE id=?').run(g.player_o_id, g.player_o_name, g.status, JSON.stringify(g.board), g.current_turn, g.winner_id, JSON.stringify(g.winning_cells), g.updated_at, g.finished_at, g.finish_reason,JSON.stringify({mode:g.mode||'classic',move_order:g.move_order,move_count:g.move_count,bomb_events:g.bomb_events}),g.id);
  }
  create(user: Player, mode: GameMode = 'classic') {
    if(mode!=='classic'&&mode!=='bombs')throw new Error('Choose a valid game mode.');
    return this.atomic(() => {
      if (this.active(user.id)) throw new Error('Finish or cancel your current match first.');
      const now = new Date().toISOString();
      const g: Game = { id: randomUUID(), player_x_id: user.id, player_x_name: user.username, player_o_id: null, player_o_name: null, status: 'waiting', board: Array(mode==='bombs'?16:9).fill(''), current_turn: 'X', winner_id: null, winning_cells: [], created_at: now, updated_at: now, finished_at: null, finish_reason: null,mode,move_order:[],move_count:0,bomb_events:[] };
      this.db.prepare('INSERT INTO games(id,player_x_id,player_o_id,player_x_name,player_o_name,status,board,current_turn,winner_id,winning_cells,created_at,updated_at,finished_at,finish_reason,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(g.id,g.player_x_id,g.player_o_id,g.player_x_name,g.player_o_name,g.status,JSON.stringify(g.board),g.current_turn,g.winner_id,JSON.stringify(g.winning_cells),g.created_at,g.updated_at,g.finished_at,g.finish_reason,JSON.stringify({mode,move_order:[],move_count:0,bomb_events:[]}));
      if(mode==='bombs'){
        const first=randomInt(16);let second=randomInt(15);if(second>=first)second++;
        const insert=this.db.prepare('INSERT INTO game_bombs VALUES(?,?,?)');insert.run(g.id,first,'opponent');insert.run(g.id,second,'both');
      }
      return g;
    });
  }
  join(user: Player, id: string) {
    return this.atomic(() => {
      if (this.active(user.id)) throw new Error('Finish or cancel your current match first.');
      const g = this.game(id);
      if (g.player_x_id === user.id) throw new Error('You cannot join your own challenge.');
      if (g.status !== 'waiting' || g.player_o_id) throw new Error('Another player already joined, or this challenge was cancelled.');
      const next: Game = { ...g, player_o_id: user.id, player_o_name: user.username, status: 'playing', current_turn:'O', updated_at: new Date().toISOString() };
      this.save(next); return next;
    });
  }
  play(user: Player, id: string, cell: number) { return this.atomic(() => { const bombs=this.db.prepare('SELECT cell,type FROM game_bombs WHERE game_id=?').all(id) as Bomb[];const next = move(this.game(id), user.id, cell,bombs); this.save(next); return next; }); }
  cancel(user: Player, id: string) { return this.atomic(() => { const g = this.game(id); if (g.player_x_id !== user.id || g.status !== 'waiting') throw new Error('Only the creator can cancel a waiting challenge.'); this.save({ ...g, status: 'cancelled', updated_at: new Date().toISOString() }); }); }
  resign(user: Player, id: string) { return this.atomic(() => {
    const g = this.game(id);
    if (g.status !== 'playing' || (g.player_x_id !== user.id && g.player_o_id !== user.id)) throw new Error('You cannot resign from this game.');
    const now = new Date().toISOString(); this.save({ ...g, status: 'finished', winner_id: g.player_x_id === user.id ? g.player_o_id : g.player_x_id, finish_reason: 'resignation', finished_at: now, updated_at: now });
  }); }
  snapshot(user: Player): Snapshot {
    this.db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), user.id);
    const history = (this.db.prepare("SELECT * FROM games WHERE status='finished' AND (player_x_id=? OR player_o_id=?) ORDER BY finished_at DESC LIMIT 100").all(user.id,user.id) as DbGame[]).map(g => this.decode(g));
    const stats = this.db.prepare("SELECT coalesce(sum(winner_id=?),0) wins, coalesce(sum(winner_id IS NOT NULL AND winner_id<>?),0) losses, coalesce(sum(winner_id IS NULL),0) draws FROM games WHERE status='finished' AND (player_x_id=? OR player_o_id=?)").get(user.id,user.id,user.id,user.id) as Snapshot['stats'];
    return { user, history, stats, active: this.active(user.id), challenges: (this.db.prepare("SELECT * FROM games WHERE status='waiting' AND player_x_id<>? ORDER BY created_at DESC LIMIT 100").all(user.id) as DbGame[]).map(g => this.decode(g)), onlineIds: (this.db.prepare('SELECT id FROM users WHERE last_seen>?').all(Date.now()-30000) as {id:string}[]).map(u => u.id) };
  }
}
const globalStore = globalThis as unknown as { qalimStore?: LocalStore };
export function store() { return globalStore.qalimStore ||= new LocalStore(); }
