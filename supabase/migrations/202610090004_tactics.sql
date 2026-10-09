-- Apply after migrations 001, 002 and 003. Existing matches are preserved.
begin;
alter table public.games drop constraint if exists games_mode_check;
alter table public.games add constraint games_mode_check check(mode in ('classic','bombs','tactics'));
alter table public.games drop constraint if exists games_board_check;
alter table public.games add constraint games_board_check check(board <@ array['','X','O'] and ((mode='classic' and array_length(board,1)=9) or (mode in ('bombs','tactics') and array_length(board,1)=16)));
alter table public.games drop constraint if exists games_finish_reason_check;
alter table public.games add constraint games_finish_reason_check check(finish_reason in ('line','draw','resignation','pressure'));
alter table public.games add column if not exists tactics jsonb not null default '{"used":{"X":false,"O":false},"shields":[],"events":[]}' check(jsonb_typeof(tactics)='object');

create or replace function public.tactics_pressure(p_board text[],p_mark text) returns integer language plpgsql immutable strict set search_path=public as $$
declare cells integer[]; count integer; score integer:=0;
  lines integer[]:=array[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],[0,5,10,15],[3,6,9,12]];
begin
  foreach cells slice 1 in array lines loop
    if not exists(select 1 from unnest(cells) slot where p_board[slot+1] not in ('',p_mark)) then
      select count(*) into count from unnest(cells) slot where p_board[slot+1]=p_mark;
      score:=score+case count when 2 then 1 when 3 then 3 else 0 end;
    end if;
  end loop;
  return score;
end; $$;

create or replace function public.create_tactics_challenge() returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); g public.games; name text;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.games where status in ('waiting','playing') and uid in (player_x_id,player_o_id)) then raise exception 'Finish or cancel your current match first.'; end if;
  select username into strict name from public.profiles where id=uid;
  insert into public.games(player_x_id,player_x_name,mode,board) values(uid,name,'tactics',array_fill(''::text,array[16])) returning * into g;
  return g;
end; $$;

create or replace function public.make_tactics_move(p_game_id uuid,p_cell integer,p_tactic text default 'place') returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); g public.games; mark text; rival text; oldest integer; shields integer[]; cells integer[];
  winning integer[]:='{}'; winner uuid:=null; done boolean:=false; reason text:=null; sx integer; so integer;
  lines integer[]:=array[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],[0,5,10,15],[3,6,9,12]];
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'This game no longer exists.'; end if;
  if g.mode<>'tactics' or g.status<>'playing' then raise exception 'This game is not accepting tactics moves.'; end if;
  if uid=g.player_x_id then mark:='X'; elsif uid=g.player_o_id then mark:='O'; else raise exception 'You are not a player in this game.'; end if;
  if mark<>g.current_turn then raise exception 'Wait for your turn.'; end if;
  rival:=case mark when 'X' then 'O' else 'X' end;
  if p_cell is null or p_cell<0 or p_cell>=16 then raise exception 'Choose a valid square.'; end if;
  if p_tactic is null or p_tactic not in ('place','capture','shield') then raise exception 'Choose a valid tactic.'; end if;
  if p_tactic<>'place' and (g.tactics->'used'->>mark)::boolean then raise exception 'Your power has already been spent.'; end if;
  select coalesce(array_agg(value::integer),'{}') into shields from jsonb_array_elements_text(g.tactics->'shields');
  if p_tactic='capture' then
    if g.board[p_cell+1]<>rival then raise exception 'Capture an opponent’s mark.'; end if;
    if p_cell=any(shields) then raise exception 'That mark is shielded.'; end if;
    g.move_order:=array_remove(g.move_order,p_cell);
  elsif g.board[p_cell+1]<>'' then raise exception 'That square is already occupied.';
  end if;
  g.board[p_cell+1]:=mark; g.move_order:=array_append(g.move_order,p_cell); g.move_count:=g.move_count+1;
  if p_tactic<>'place' then
    g.tactics:=jsonb_set(g.tactics,array['used',mark],'true'::jsonb);
    g.tactics:=jsonb_set(g.tactics,'{events}',(g.tactics->'events')||jsonb_build_array(jsonb_build_object('type',p_tactic,'cell',p_cell,'by',mark,'turn',g.move_count)));
    if p_tactic='shield' then shields:=array_append(shields,p_cell); end if;
  end if;
  if (select count(*) from unnest(g.move_order) slot where g.board[slot+1]=mark)>4 then
    select slot into oldest from unnest(g.move_order) with ordinality as ord(slot,position) where g.board[slot+1]=mark order by position limit 1;
    g.board[oldest+1]:=''; g.move_order:=array_remove(g.move_order,oldest); shields:=array_remove(shields,oldest);
    g.tactics:=jsonb_set(g.tactics,'{events}',(g.tactics->'events')||jsonb_build_array(jsonb_build_object('type','fade','cell',oldest,'by',mark,'turn',g.move_count)));
  end if;
  g.tactics:=jsonb_set(g.tactics,'{shields}',to_jsonb(shields));
  -- Retire old marks before checking victory; a temporary fifth mark cannot win.
  foreach cells slice 1 in array lines loop
    if not exists(select 1 from unnest(cells) slot where g.board[slot+1]<>mark) then winning:=cells;winner:=uid;done:=true;reason:='line';exit;end if;
  end loop;
  if not done and g.move_count>=40 then
    sx:=public.tactics_pressure(g.board,'X'); so:=public.tactics_pressure(g.board,'O');
    winner:=case when sx>so then g.player_x_id when so>sx then g.player_o_id else null end;
    done:=true; reason:=case when winner is null then 'draw' else 'pressure' end;
  end if;
  update public.games set board=g.board,move_order=g.move_order,move_count=g.move_count,tactics=g.tactics,
    current_turn=rival,status=case when done then 'finished' else 'playing' end,
    winner_id=winner,winning_cells=winning,updated_at=now(),finished_at=case when done then now() else null end,finish_reason=reason
    where id=p_game_id returning * into g;
  return g;
end; $$;

revoke execute on function public.tactics_pressure(text[],text),public.create_tactics_challenge(),public.make_tactics_move(uuid,integer,text) from public,anon;
grant execute on function public.create_tactics_challenge(),public.make_tactics_move(uuid,integer,text) to authenticated;
-- Legacy make_move routing is installed below, preventing rule bypass.
create or replace function public.make_move(p_game_id uuid,p_cell integer) returns public.games language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); g public.games; mark text; bomb public.game_bombs; target text;
  removed integer[]:='{}'; picks integer[]; slot integer; cells integer[]; lines integer[];
  winning integer[]:='{}'; done boolean:=false; is_draw boolean:=false;
begin
  if uid is null then raise exception 'Please sign in.'; end if;
  select * into g from public.games where id=p_game_id for update;
  if not found then raise exception 'This game no longer exists.'; end if;
  if g.mode='tactics' then return public.make_tactics_move(p_game_id,p_cell,'place'); end if;
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
