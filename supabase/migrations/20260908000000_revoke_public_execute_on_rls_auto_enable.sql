-- T230: the platform's RLS event-trigger helper is not an application RPC.
-- Keep the SECURITY DEFINER event trigger available internally, but remove the
-- inherited PUBLIC EXECUTE grant that exposes it to anon/authenticated clients.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
  end if;
end
$$;
