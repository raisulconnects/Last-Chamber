-- Last Chamber: phase 1 foundation (accounts, profile, inventory, one-time guest import).
-- Run once in the Supabase SQL editor. Safe to run again: everything is idempotent.
--
-- Design rules:
--  * The browser only ever holds the public anon key.
--  * Row Level Security is ON for every table. Clients can READ their own rows and NOTHING ELSE.
--  * All writes (Shells, items, name) go through the SECURITY DEFINER functions below.
--  * The shop catalog block is generated from src/shop.ts: run `npm run gen:sql` after changing the shop.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table if not exists public.shop_items (
  id       text primary key,
  category text not null,
  rarity   text not null,
  price    integer not null check (price >= 0)
);

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (display_name ~ '^[A-Za-z0-9 _-]{3,14}$'),
  shells       integer not null default 0 check (shells >= 0),
  total_earned integer not null default 0 check (total_earned >= 0),
  equipped     jsonb not null default '{}'::jsonb,
  xp           integer not null default 0 check (xp >= 0),
  level        integer not null default 1 check (level >= 1),
  imported     boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create unique index if not exists profiles_display_name_lower_key on public.profiles (lower(display_name));

create table if not exists public.inventory (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null references public.shop_items (id),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ---------------------------------------------------------------------------------------------
-- Shop catalog (generated from src/shop.ts)
-- ---------------------------------------------------------------------------------------------
-- BEGIN GENERATED SHOP ITEMS
insert into public.shop_items (id, category, rarity, price) values
  ('skin-cyan', 'skin', 'common', 0),
  ('skin-mint', 'skin', 'common', 100),
  ('skin-rose', 'skin', 'common', 100),
  ('skin-slate', 'skin', 'common', 100),
  ('skin-stripes', 'skin', 'rare', 350),
  ('skin-lime', 'skin', 'rare', 400),
  ('skin-gold', 'skin', 'epic', 900),
  ('skin-phantom', 'skin', 'legendary', 2500),
  ('skin-chrome', 'skin', 'legendary', 3000),
  ('shot-default', 'shot', 'common', 0),
  ('shot-lime', 'shot', 'common', 80),
  ('shot-pink', 'shot', 'common', 80),
  ('shot-ice', 'shot', 'common', 100),
  ('shot-rainbow', 'shot', 'rare', 400),
  ('shot-plasma', 'shot', 'epic', 1000),
  ('shot-comet', 'shot', 'legendary', 2500),
  ('kill-none', 'kill', 'common', 0),
  ('kill-spark', 'kill', 'common', 150),
  ('kill-ring', 'kill', 'rare', 400),
  ('kill-confetti', 'kill', 'epic', 900),
  ('kill-lightning', 'kill', 'legendary', 2500),
  ('arena-concrete', 'arena', 'common', 0),
  ('arena-midnight', 'arena', 'common', 150),
  ('arena-sand', 'arena', 'common', 150),
  ('arena-lava', 'arena', 'rare', 500),
  ('arena-frost', 'arena', 'rare', 500),
  ('arena-neon', 'arena', 'epic', 1200),
  ('arena-void', 'arena', 'legendary', 3000),
  ('title-rookie', 'title', 'common', 0),
  ('title-sharp', 'title', 'common', 120),
  ('title-deadeye', 'title', 'rare', 300),
  ('title-ghost', 'title', 'epic', 600),
  ('title-last', 'title', 'legendary', 2000)
on conflict (id) do update set category = excluded.category, rarity = excluded.rarity, price = excluded.price;
-- END GENERATED SHOP ITEMS

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: read own rows only; no client writes at all
-- ---------------------------------------------------------------------------------------------
alter table public.shop_items enable row level security;
alter table public.profiles   enable row level security;
alter table public.inventory  enable row level security;

drop policy if exists "catalog is public" on public.shop_items;
create policy "catalog is public" on public.shop_items for select to anon, authenticated using (true);

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "read own inventory" on public.inventory;
create policy "read own inventory" on public.inventory for select to authenticated using (user_id = auth.uid());

revoke all on public.shop_items, public.profiles, public.inventory from anon, authenticated;
grant select on public.shop_items to anon, authenticated;
grant select on public.profiles, public.inventory to authenticated;

-- Public, read-only view for leaderboards / profiles later. Never exposes email or balances.
create or replace view public.public_profiles as
  select id, display_name, level from public.profiles;
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers (internal: not callable from the browser)
-- ---------------------------------------------------------------------------------------------
create or replace function public.valid_display_name(n text)
returns boolean language sql immutable as $$
  select n is not null
     and n = btrim(n)
     and n ~ '^[A-Za-z0-9 _-]{3,14}$'
     and lower(n) <> all (array['admin', 'administrator', 'moderator', 'support', 'system', 'lastchamber', 'last chamber']);
$$;

create or replace function public.ensure_profile(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  candidate text;
  tries int := 0;
begin
  if exists (select 1 from public.profiles where id = uid) then return; end if;
  loop
    if tries < 20 then
      candidate := 'Player' || lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      candidate := 'P' || substr(md5(uid::text || tries::text), 1, 10);
    end if;
    begin
      insert into public.profiles (id, display_name, equipped)
      values (uid, candidate, (select coalesce(jsonb_object_agg(category, id), '{}'::jsonb) from public.shop_items where price = 0));
      exit;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = uid) then return; end if;
      tries := tries + 1;
    end;
  end loop;
  insert into public.inventory (user_id, item_id)
  select uid, id from public.shop_items where price = 0
  on conflict do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_profile(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.profile_json(uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'display_name', p.display_name,
    'shells', p.shells,
    'total_earned', p.total_earned,
    'equipped', p.equipped,
    'xp', p.xp,
    'level', p.level,
    'imported', p.imported,
    'created_at', p.created_at,
    'owned', coalesce((select jsonb_agg(i.item_id order by i.acquired_at, i.item_id) from public.inventory i where i.user_id = p.id), '[]'::jsonb)
  )
  from public.profiles p where p.id = uid;
$$;

revoke execute on function public.valid_display_name(text), public.ensure_profile(uuid), public.handle_new_user(), public.profile_json(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- RPC functions the browser may call (signed-in users only)
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_profile(uid);
  update public.profiles set last_seen = now() where id = uid;
  return public.profile_json(uid);
end;
$$;

create or replace function public.set_display_name(new_name text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.valid_display_name(new_name) then return 'invalid'; end if;
  begin
    update public.profiles set display_name = new_name where id = uid;
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end;
$$;

-- One-time import of a guest save. Limits (keep in sync with src/merge.ts):
--   Shells <= 3000, total earned <= 20000, owned paid items worth <= 15000 (cheapest accepted first).
create or replace function public.import_local_progress(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  shells_in int := 0;
  earned_in int := 0;
  spent int := 0;
  item record;
  cat record;
  eq jsonb := '{}'::jsonb;
  pick text;
  nm text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_profile(uid);
  select * into prof from public.profiles where id = uid for update;
  if prof.imported then return public.profile_json(uid); end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then payload := '{}'::jsonb; end if;

  if jsonb_typeof(payload -> 'shells') = 'number' then
    shells_in := least(greatest((payload ->> 'shells')::numeric, 0), 3000)::int;
  end if;
  if jsonb_typeof(payload -> 'total_earned') = 'number' then
    earned_in := least(greatest((payload ->> 'total_earned')::numeric, 0), 20000)::int;
  end if;
  earned_in := greatest(earned_in, shells_in);

  if jsonb_typeof(payload -> 'owned') = 'array' then
    for item in
      select s.id, s.price from public.shop_items s
      where s.price > 0 and s.id in (select jsonb_array_elements_text(payload -> 'owned'))
      order by s.price, s.id
    loop
      if spent + item.price <= 15000 then
        insert into public.inventory (user_id, item_id) values (uid, item.id) on conflict do nothing;
        spent := spent + item.price;
      end if;
    end loop;
  end if;

  -- Equip only items the account owns, falling back to the free item of each category.
  for cat in select distinct category from public.shop_items loop
    pick := null;
    if jsonb_typeof(payload -> 'equipped') = 'object' then
      select s.id into pick from public.shop_items s
      join public.inventory i on i.item_id = s.id and i.user_id = uid
      where s.category = cat.category and s.id = (payload -> 'equipped' ->> cat.category);
    end if;
    if pick is null then
      select s.id into pick from public.shop_items s where s.category = cat.category and s.price = 0 limit 1;
    end if;
    eq := eq || jsonb_build_object(cat.category, pick);
  end loop;

  update public.profiles
     set shells = shells_in, total_earned = earned_in, equipped = eq, imported = true
   where id = uid;

  -- Keep the guest's chosen name when it is valid, not the default, and still free.
  nm := payload ->> 'name';
  if public.valid_display_name(nm) and lower(nm) <> 'player' then
    begin
      update public.profiles set display_name = nm where id = uid;
    exception when unique_violation then
      null; -- keep the generated name
    end;
  end if;

  return public.profile_json(uid);
end;
$$;

revoke execute on function public.get_profile(), public.set_display_name(text), public.import_local_progress(jsonb) from public, anon;
grant execute on function public.get_profile(), public.set_display_name(text), public.import_local_progress(jsonb) to authenticated;
