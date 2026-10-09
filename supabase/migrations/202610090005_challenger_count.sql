-- Public registration total only. Profiles and account details stay protected.
begin;
create or replace function public.get_challenger_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from public.profiles; $$;
revoke execute on function public.get_challenger_count() from public;
grant execute on function public.get_challenger_count() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
