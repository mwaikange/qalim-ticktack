-- Apply after the original tickTack setup. Existing classic games stay intact.
begin;
alter table public.games add column if not exists mode text not null default 'classic' check(mode in ('classic','bombs'));
alter table public.games add column if not exists move_order integer[] not null default '{}';
alter table public.games add column if not exists move_count integer not null default 0 check(move_count>=0);
alter table public.games add column if not exists bomb_events jsonb not null default '[]' check(jsonb_typeof(bomb_events)='array');
alter table public.games drop constraint if exists games_board_check;
alter table public.games add constraint games_board_check check(board <@ array['','X','O'] and ((mode='classic' and array_length(board,1)=9) or (mode='bombs' and array_length(board,1)=16)));
update public.games g set
  move_count=(select count(*)::integer from unnest(g.board) mark where mark<>''),
  move_order=coalesce((select array_agg((position-1)::integer order by position) from unnest(g.board) with ordinality as existing(mark,position) where mark<>''),'{}')
  where mode='classic' and move_count=0;

-- Secret positions never appear in games, snapshots, or Realtime payloads.
create table if not exists public.game_bombs(
  game_id uuid not null references public.games(id) on delete cascade,
  cell integer not null check(cell between 0 and 15),
  type text not null check(type in ('opponent','both')),
  triggered boolean not null default false,
  primary key(game_id,cell),unique(game_id,type)
);
alter table public.game_bombs enable row level security;
revoke all on public.game_bombs from public,anon,authenticated;

create or replace function public.create_bomb_challenge() returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); g public.games; name text; positions integer[];
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.games where status in ('waiting','playing') and uid in (player_x_id,player_o_id)) then raise exception 'Finish or cancel your current match first.'; end if;
  select username into strict name from public.profiles where id=uid;
  insert into public.games(player_x_id,player_x_name,mode,board) values(uid,name,'bombs',array_fill(''::text,array[16])) returning * into g;
  select array_agg(cell) into positions from (select cell from generate_series(0,15) cell order by gen_random_uuid() limit 2) shuffled;
  insert into public.game_bombs(game_id,cell,type) values(g.id,positions[1],'opponent'),(g.id,positions[2],'both');
  return g;
end; $$;

create or replace function public.make_move(p_game_id uuid,p_cell integer) returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); g public.games; mark text; bomb public.game_bombs; target text;
  removed integer[]:='{}'; picks integer[]; slot integer; cells integer[]; lines integer[];
  winning integer[]:='{}'; done boolean:=false; is_draw boolean:=false;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'This game no longer exists.'; end if;
  if g.status<>'playing' then raise exception 'This game is not accepting moves.'; end if;
  if uid=g.player_x_id then mark:='X'; elsif uid=g.player_o_id then mark:='O'; else raise exception 'You are not a player in this game.'; end if;
  if mark<>g.current_turn then raise exception 'Wait for your turn.'; end if;
  if p_cell is null or p_cell<0 or p_cell>=array_length(g.board,1) then raise exception 'Choose a valid square.'; end if;
  if g.board[p_cell+1]<>'' then raise exception 'That square is already occupied.'; end if;
  g.board[p_cell+1]:=mark;g.move_order:=array_append(g.move_order,p_cell);g.move_count:=g.move_count+1;
  if g.mode='bombs' then
    select * into bomb from public.game_bombs where game_id=g.id and cell=p_cell and not triggered;
    if found then
      foreach target in array case when bomb.type='both' then array['X','O'] else array[case mark when 'X' then 'O' else 'X' end] end loop
        select coalesce(array_agg(oldest.slot order by oldest.position),'{}') into picks from
          (select ord.slot,ord.position from unnest(g.move_order) with ordinality as ord(slot,position) where g.board[ord.slot+1]=target order by ord.position limit 2) oldest;
        removed:=removed||picks;
      end loop;
      foreach slot in array removed loop g.board[slot+1]:='';end loop;
      select coalesce(array_agg(ord.slot order by ord.position),'{}') into g.move_order from unnest(g.move_order) with ordinality as ord(slot,position) where not ord.slot=any(removed);
      g.bomb_events:=g.bomb_events||jsonb_build_array(jsonb_build_object('cell',p_cell,'type',bomb.type,'removed',to_jsonb(removed),'by',mark,'turn',g.move_count));
      update public.game_bombs set triggered=true where game_id=g.id and cell=p_cell;
    end if;
    lines:=array[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],[0,5,10,15],[3,6,9,12]];
  else
    lines:=array[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  end if;
  -- Resolve explosions before checking victory or a full-board draw.
  foreach cells slice 1 in array lines loop
    if not exists(select 1 from unnest(cells) candidate where g.board[candidate+1]<>mark) then winning:=cells;done:=true;exit;end if;
  end loop;
  is_draw:=not done and not (''=any(g.board));
  update public.games set board=g.board,move_order=g.move_order,move_count=g.move_count,bomb_events=g.bomb_events,
    current_turn=case mark when 'X' then 'O' else 'X' end,status=case when done or is_draw then 'finished' else 'playing' end,
    winner_id=case when done then uid else null end,winning_cells=winning,updated_at=now(),
    finished_at=case when done or is_draw then now() else null end,finish_reason=case when done then 'line' when is_draw then 'draw' else null end
    where id=p_game_id returning * into g;
  return g;
end; $$;
revoke execute on function public.create_bomb_challenge(),public.make_move(uuid,integer) from public,anon;
grant execute on function public.create_bomb_challenge(),public.make_move(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
