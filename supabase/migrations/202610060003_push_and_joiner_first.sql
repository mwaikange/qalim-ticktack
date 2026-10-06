-- Run after both earlier migrations. Existing games keep their current turn.
begin;
create table if not exists public.push_devices (
  token text primary key check (token ~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user on public.push_devices(user_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from public,anon,authenticated;
grant all on public.push_devices to service_role;

create or replace function public.register_push_device(p_token text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if p_token is null or p_token !~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid push token.'; end if;
  -- A device can belong to only its current account, including account switches.
  insert into public.push_devices(token,user_id) values(p_token,auth.uid())
  on conflict(token) do update set user_id=auth.uid(),updated_at=now();
end; $$;
create or replace function public.unregister_push_device(p_token text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  delete from public.push_devices where token=p_token and user_id=auth.uid();
end; $$;
revoke execute on function public.register_push_device(text),public.unregister_push_device(text) from public,anon;
grant execute on function public.register_push_device(text),public.unregister_push_device(text) to authenticated;

create or replace function public.join_challenge(p_game_id uuid) returns public.games
language plpgsql security definer set search_path=public as $$
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
  update public.games set player_o_id=uid,player_o_name=name,status='playing',current_turn='O',updated_at=now()
  where id=p_game_id returning * into g;
  return g;
end; $$;
revoke execute on function public.join_challenge(uuid) from public,anon;
grant execute on function public.join_challenge(uuid) to authenticated;

-- One private event per actual challenge transition; moves never create alerts.
create table if not exists public.push_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  kind text not null check(kind in ('created','accepted')),
  state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error text,
  cursor_token text not null default '',
  unique(game_id,kind)
);
create table if not exists public.push_receipts (
  id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.push_events enable row level security;
alter table public.push_receipts enable row level security;
revoke all on public.push_events,public.push_receipts from public,anon,authenticated;
grant all on public.push_events,public.push_receipts to service_role;
create or replace function public.queue_challenge_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='INSERT' then
    if new.status='waiting' then insert into public.push_events(game_id,kind) values(new.id,'created') on conflict do nothing; end if;
  elsif old.status='waiting' and new.status='playing' and old.player_o_id is null and new.player_o_id is not null then
    insert into public.push_events(game_id,kind) values(new.id,'accepted') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke execute on function public.queue_challenge_push() from public,anon,authenticated;
drop trigger if exists challenge_push_event on public.games;
create trigger challenge_push_event after insert or update on public.games for each row execute function public.queue_challenge_push();
commit;
