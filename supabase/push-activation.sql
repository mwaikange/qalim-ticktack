-- The setup script replaces __PROJECT_REF__ and __PUSH_SECRET__ locally.
-- This uses Supabase's asynchronous HTTP queue, so pushes cannot slow down moves.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
do $$
declare secret_id uuid;
begin
  select id into secret_id from vault.secrets where name='qalim_push_webhook_secret' limit 1;
  if secret_id is null then
    perform vault.create_secret('__PUSH_SECRET__','qalim_push_webhook_secret');
  else
    perform vault.update_secret(secret_id,'__PUSH_SECRET__');
  end if;
end; $$;
create or replace function public.dispatch_challenge_push() returns trigger
language plpgsql security definer set search_path=public as $$
declare push_secret text;
begin
  select decrypted_secret into push_secret from vault.decrypted_secrets where name='qalim_push_webhook_secret' limit 1;
  if push_secret is null then raise warning 'QALIM push secret is missing'; return new; end if;
  perform net.http_post(
    url:='https://__PROJECT_REF__.supabase.co/functions/v1/push-challenges',
    headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',push_secret),
    body:=jsonb_build_object('type','INSERT','schema','public','table','push_events','record',to_jsonb(new)),
    timeout_milliseconds:=55000
  );
  return new;
exception when others then
  -- The private outbox row remains pending and the next cron run retries it.
  raise warning 'Challenge push will be retried: %',SQLERRM;
  return new;
end; $$;
revoke execute on function public.dispatch_challenge_push() from public,anon,authenticated;
drop trigger if exists dispatch_challenge_push on public.push_events;
create trigger dispatch_challenge_push after insert on public.push_events for each row execute function public.dispatch_challenge_push();
do $$
declare old_job bigint;
begin
  for old_job in select jobid from cron.job where jobname='qalim-push-maintenance' loop
    perform cron.unschedule(old_job);
  end loop;
end; $$;
select cron.schedule('qalim-push-maintenance','* * * * *',$job$
  select net.http_post(
    url:='https://__PROJECT_REF__.supabase.co/functions/v1/push-challenges',
    headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='qalim_push_webhook_secret' limit 1)),
    body:='{"action":"maintenance"}'::jsonb,timeout_milliseconds:=55000
  );
$job$);
