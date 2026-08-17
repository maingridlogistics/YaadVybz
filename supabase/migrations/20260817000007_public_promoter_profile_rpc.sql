-- Migration 20260817000007: Extend get_public_promoter_profiles to return banner_url + subscription_tier
-- Required for Elite Creator Banner to display on public Creator Profile page.
-- DROP required because return type (new OUT columns) differs from existing function.

drop function if exists public.get_public_promoter_profiles(uuid[]);

create function public.get_public_promoter_profiles(
  p_promoter_ids uuid[]
)
returns table (
  id                 uuid,
  name               text,
  avatar_url         text,
  banner_url         text,
  subscription_tier  text,
  verified_promoter  boolean,
  home_parish        text
)
language sql
security definer
stable
as $$
  select
    up.id,
    up.name,
    up.avatar_url,
    up.banner_url,
    up.subscription_tier,
    up.verified_promoter,
    up.home_parish
  from public.user_profiles up
  where up.id = any(p_promoter_ids);
$$;

grant execute on function public.get_public_promoter_profiles(uuid[]) to anon, authenticated;

-- Grant INSERT on promoter_payout_accounts to authenticated so new accounts can be created.
-- (Previous migration only granted UPDATE on specific columns; INSERT also requires table-level grant.)
grant insert on public.promoter_payout_accounts to authenticated;

notify pgrst, 'reload schema';
