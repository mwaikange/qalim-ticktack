-- Apply once in the Supabase SQL editor. All writes use validated RPCs.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 24),
  created_at timestamptz not null default now()
);
create table public.games (
  id uuid primary key default gen_random_uuid(),
  player_x_id uuid not null references public.profiles(id),
  player_o_id uuid references public.profiles(id),
  player_x_name text not null, player_o_name text,
  status text not null default 'waiting' check (status in ('waiting','playing','finished','cancelled')),
  board text[] not null default array['','','','','','','','',''] check (array_length(board,1)=9 and board <@ array['','X','O']),
  current_turn text not null default 'X' check (current_turn in ('X','O')),
  winner_id uuid references public.profiles(id),
  winning_cells integer[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  finished_at timestamptz, finish_reason text check (finish_reason in ('line','draw','resignation')),
  check (player_o_id is null or player_o_id <> player_x_id),
  check (winner_id is null or winner_id=player_x_id or winner_id=player_o_id),
  check (status not in ('playing','finished') or player_o_id is not null)
);
create index games_open on public.games(created_at desc) where status='waiting';
create index games_player_x on public.games(player_x_id,created_at desc);
create index games_player_o on public.games(player_o_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.games enable row level security;
revoke all on public.profiles,public.games from anon,authenticated;
grant select on public.profiles,public.games to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy games_read on public.games for select to authenticated using (status='waiting' or auth.uid() in (player_x_id,player_o_id));

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare name text;
begin
  name := btrim(coalesce(new.raw_user_meta_data->>'username','Player'));
  if char_length(name) not between 2 and 24 then raise exception 'Player name must be 2–24 characters.'; end if;
  insert into public.profiles(id,username) values(new.id,name);
  return new;
end; $$;
create trigger create_player_profile after insert on auth.users for each row execute function public.handle_new_user();
-- Cover accounts created before this migration without exposing email addresses.
insert into public.profiles(id,username) select id,case when char_length(btrim(raw_user_meta_data->>'username')) between 2 and 24 then btrim(raw_user_meta_data->>'username') else 'Player' end from auth.users where id not in (select id from public.profiles);

create function public.create_challenge() returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); g public.games; name text;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.games where status in ('waiting','playing') and uid in (player_x_id,player_o_id)) then raise exception 'Finish or cancel your current match first.'; end if;
  select username into strict name from public.profiles where id=uid;
  insert into public.games(player_x_id,player_x_name) values(uid,name) returning * into g;
  return g;
end; $$;
create function public.join_challenge(p_game_id uuid) returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); g public.games; name text;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.games where status in ('waiting','playing') and uid in (player_x_id,player_o_id)) then raise exception 'Finish or cancel your current match first.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'This challenge no longer exists.'; end if;
  if g.player_x_id=uid then raise exception 'You cannot join your own challenge.'; end if;
  if g.status<>'waiting' or g.player_o_id is not null then raise exception 'Another player already joined, or this challenge was cancelled.'; end if;
  select username into strict name from public.profiles where id=uid;
  update public.games set player_o_id=uid,player_o_name=name,status='playing',updated_at=now() where id=p_game_id returning * into g;
  return g;
end; $$;
create function public.make_move(p_game_id uuid,p_cell integer) returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); g public.games; mark text; cells integer[]; winning integer[] := '{}'; done boolean := false; is_draw boolean := false;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'This game no longer exists.'; end if;
  if g.status<>'playing' then raise exception 'This game is not accepting moves.'; end if;
  if uid=g.player_x_id then mark:='X'; elsif uid=g.player_o_id then mark:='O'; else raise exception 'You are not a player in this game.'; end if;
  if mark<>g.current_turn then raise exception 'Wait for your turn.'; end if;
  if p_cell is null or p_cell<0 or p_cell>8 then raise exception 'Choose a valid square.'; end if;
  if g.board[p_cell+1]<>'' then raise exception 'That square is already occupied.'; end if;
  g.board[p_cell+1]:=mark;
  foreach cells slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
    if g.board[cells[1]]=mark and g.board[cells[2]]=mark and g.board[cells[3]]=mark then
      winning:=array[cells[1]-1,cells[2]-1,cells[3]-1]; done:=true; exit;
    end if;
  end loop;
  is_draw := not done and not (''=any(g.board));
  update public.games set board=g.board,current_turn=case mark when 'X' then 'O' else 'X' end,
    status=case when done or is_draw then 'finished' else 'playing' end,
    winner_id=case when done then uid else null end,winning_cells=winning,updated_at=now(),
    finished_at=case when done or is_draw then now() else null end,
    finish_reason=case when done then 'line' when is_draw then 'draw' else null end
    where id=p_game_id returning * into g;
  return g;
end; $$;
create function public.cancel_challenge(p_game_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); g public.games;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found or g.player_x_id<>uid or g.status<>'waiting' then raise exception 'Only the creator can cancel a waiting challenge.'; end if;
  update public.games set status='cancelled',updated_at=now() where id=p_game_id;
end; $$;
create function public.resign_game(p_game_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); g public.games;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found or g.status<>'playing' or (uid<>g.player_x_id and uid<>g.player_o_id) then raise exception 'You cannot resign from this game.'; end if;
  update public.games set status='finished',winner_id=case when uid=player_x_id then player_o_id else player_x_id end,finish_reason='resignation',finished_at=now(),updated_at=now() where id=p_game_id;
end; $$;
create function public.get_snapshot() returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select jsonb_build_object(
    'challenges',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from (select * from public.games where status='waiting' and player_x_id<>uid order by created_at desc limit 100) g),'[]'::jsonb),
    'active',(select to_jsonb(g) from public.games g where status in ('waiting','playing') and uid in (player_x_id,player_o_id) order by created_at desc limit 1),
    'history',coalesce((select jsonb_agg(to_jsonb(g) order by g.finished_at desc) from (select * from public.games where status='finished' and uid in (player_x_id,player_o_id) order by finished_at desc limit 100) g),'[]'::jsonb),
    'stats',(select jsonb_build_object('wins',count(*) filter(where winner_id=uid),'losses',count(*) filter(where winner_id is not null and winner_id<>uid),'draws',count(*) filter(where winner_id is null)) from public.games where status='finished' and uid in (player_x_id,player_o_id))
  ) into result;
  return result;
end; $$;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.create_challenge(),public.join_challenge(uuid),public.make_move(uuid,integer),public.cancel_challenge(uuid),public.resign_game(uuid),public.get_snapshot() from public,anon;
grant execute on function public.create_challenge(),public.join_challenge(uuid),public.make_move(uuid,integer),public.cancel_challenge(uuid),public.resign_game(uuid),public.get_snapshot() to authenticated;
-- Supabase Realtime filters every delivered row through games_read.
alter publication supabase_realtime add table public.games;
