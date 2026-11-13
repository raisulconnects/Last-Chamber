-- Last Chamber: phase 2 cloud economy (server-side payouts, XP and levels, stats, match history, shop RPCs).
-- Run once in the Supabase SQL editor AFTER 0001_foundation.sql. Safe to run again: everything is idempotent.
--
-- The server recomputes every payout from a match summary, so the browser can never write Shells, XP or
-- items directly. The constant block below is generated from src/economy.ts and src/levels.ts:
-- run `npm run gen:sql` after changing those rules (a test checks that the file matches).

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists reconciled boolean not null default false;

create table if not exists public.player_stats (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  played        integer not null default 0,
  wins          integer not null default 0,
  losses        integer not null default 0,
  draws         integer not null default 0,
  kills         integer not null default 0,
  streak        integer not null default 0,
  best_streak   integer not null default 0,
  best_survived integer not null default 0,
  modes         jsonb not null default '{}'::jsonb
);

create table if not exists public.matches (
  id             uuid primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  mode           text not null,
  bots           integer not null,
  difficulty     text not null,
  result         text not null check (result in ('win', 'loss', 'draw')),
  rounds         integer not null,
  survived       integer not null,
  kills          integer not null,
  shells         integer not null default 0,
  xp             integer not null default 0,
  played_at      timestamptz not null,
  created_at     timestamptz not null default now(),
  client_version text
);
create index if not exists matches_user_played_idx on public.matches (user_id, played_at desc);
create index if not exists matches_user_created_idx on public.matches (user_id, created_at desc);

alter table public.player_stats enable row level security;
alter table public.matches enable row level security;

drop policy if exists "read own stats" on public.player_stats;
create policy "read own stats" on public.player_stats for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own matches" on public.matches;
create policy "read own matches" on public.matches for select to authenticated using (user_id = auth.uid());

revoke all on public.player_stats, public.matches from anon, authenticated;
grant select on public.player_stats, public.matches to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Economy constants (generated from src/economy.ts and src/levels.ts)
-- ---------------------------------------------------------------------------------------------
-- BEGIN GENERATED ECONOMY
create or replace function public.econ_const(k text) returns int language sql immutable as $$
  select case k when 'play' then 10 when 'win' then 20 when 'draw' then 8 when 'kill' then 8 when 'round' then 2 when 'early_end' then 5 when 'cap' then 150 when 'max_level' then 100 when 'matches_per_hour' then 60 when 'shells_per_day' then 3000 end;
$$;
create or replace function public.econ_mode_pm(m text) returns int language sql immutable as $$
  select case m when 'Classic' then 1000 when 'Quick Draw' then 800 when 'Crowded Arena' then 1200 when 'Tight Circle' then 1100 when 'Marathon' then 1500 when 'Custom' then 500 else 500 end;
$$;
create or replace function public.econ_known_mode(m text) returns boolean language sql immutable as $$
  select m in ('Classic', 'Quick Draw', 'Crowded Arena', 'Tight Circle', 'Marathon', 'Custom');
$$;
create or replace function public.econ_diff_pm(d text) returns int language sql immutable as $$
  select case d when 'easy' then 800 when 'normal' then 1000 when 'hard' then 1300 else 1000 end;
$$;
create or replace function public.econ_xp_needed(lv int) returns int language sql immutable as $$
  select 100 + 40 * lv;
$$;
create or replace function public.econ_level_bonus(lv int) returns int language sql immutable as $$
  select 25 + 5 * lv;
$$;
-- END GENERATED ECONOMY

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public.jnum(j jsonb, k text) returns numeric language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'number' then (j ->> k)::numeric end;
$$;

create or replace function public.clamp_int(n numeric, lo numeric, hi numeric) returns int language sql immutable as $$
  select greatest(lo, least(hi, floor(coalesce(n, 0))))::int;
$$;

-- total XP <-> (level, xp inside level)
create or replace function public.econ_total_xp(lv int, xp int) returns int language plpgsql immutable as $$
declare sum int := greatest(xp, 0); l int;
begin
  for l in 1 .. least(public.econ_const('max_level'), greatest(lv, 1)) - 1 loop
    sum := sum + public.econ_xp_needed(l);
  end loop;
  return sum;
end;
$$;

create or replace function public.econ_split_xp(total int) returns int[] language plpgsql immutable as $$
declare lv int := 1; cur int := greatest(total, 0);
begin
  while lv < public.econ_const('max_level') and cur >= public.econ_xp_needed(lv) loop
    cur := cur - public.econ_xp_needed(lv);
    lv := lv + 1;
  end loop;
  if lv >= public.econ_const('max_level') then cur := 0; end if;
  return array[lv, cur];
end;
$$;

-- Base value of a match = XP gained (before multipliers). Mirrors calcXp in src/economy.ts.
create or replace function public.calc_xp(p_result text, p_rounds int, p_survived int, p_kills int)
returns int language sql immutable security definer set search_path = public as $$
  select case when p_rounds <= 1 then public.econ_const('early_end')
    else public.econ_const('play')
       + case p_result when 'win' then public.econ_const('win') when 'draw' then public.econ_const('draw') else 0 end
       + greatest(p_kills, 0) * public.econ_const('kill')
       + greatest(p_survived, 0) * public.econ_const('round') end;
$$;

-- Shell payout of a match. Integer per-mille math, mirrors calcPayout in src/economy.ts.
create or replace function public.calc_payout(p_mode text, p_bots int, p_difficulty text, p_result text, p_rounds int, p_survived int, p_kills int)
returns int language plpgsql immutable security definer set search_path = public as $$
declare
  base int;
  mm bigint;
  total int;
begin
  if p_rounds <= 1 then return public.econ_const('early_end'); end if;
  base := public.calc_xp(p_result, p_rounds, p_survived, p_kills);
  mm := public.econ_mode_pm(p_mode)::bigint * public.econ_diff_pm(p_difficulty) * least(1500, greatest(800, 1000 + 100 * (p_bots - 2)));
  total := ((base::bigint * mm + 500000000) / 1000000000)::int;
  return least(public.econ_const('cap'), greatest(1, total));
end;
$$;

create or replace function public.stats_json(uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('played', played, 'wins', wins, 'losses', losses, 'draws', draws, 'kills', kills,
                               'streak', streak, 'best_streak', best_streak, 'best_survived', best_survived, 'modes', modes)
       from public.player_stats where user_id = uid),
    jsonb_build_object('played', 0, 'wins', 0, 'losses', 0, 'draws', 0, 'kills', 0, 'streak', 0, 'best_streak', 0, 'best_survived', 0, 'modes', '{}'::jsonb));
$$;

create or replace function public.recent_json(uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('mode', m.mode, 'bots', m.bots, 'difficulty', m.difficulty, 'result', m.result,
                                               'rounds', m.rounds, 'survived', m.survived, 'kills', m.kills,
                                               'at', (extract(epoch from m.played_at) * 1000)::bigint) order by m.played_at desc), '[]'::jsonb)
    from (select * from public.matches where user_id = uid order by played_at desc limit 10) m;
$$;

-- Full profile document returned by every RPC (adds stats, recent matches and the reconciled flag).
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
    'reconciled', p.reconciled,
    'created_at', p.created_at,
    'owned', coalesce((select jsonb_agg(i.item_id order by i.acquired_at, i.item_id) from public.inventory i where i.user_id = p.id), '[]'::jsonb),
    'stats', public.stats_json(p.id),
    'recent', public.recent_json(p.id)
  )
  from public.profiles p where p.id = uid;
$$;

revoke execute on function public.jnum(jsonb, text), public.clamp_int(numeric, numeric, numeric),
  public.econ_total_xp(int, int), public.econ_split_xp(int), public.stats_json(uuid), public.recent_json(uuid), public.profile_json(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- submit_match: the only way Shells and XP are earned
-- ---------------------------------------------------------------------------------------------
create or replace function public.submit_match(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mid uuid;
  v_mode text;
  v_diff text;
  v_result text;
  v_bots int;
  v_rounds int;
  v_surv int;
  v_kills int;
  v_played timestamptz;
  v_ver text;
  prof public.profiles%rowtype;
  st public.player_stats%rowtype;
  existing_user uuid;
  xp_gain int;
  pay int;
  bonus int := 0;
  ups jsonb := '[]'::jsonb;
  throttled boolean := false;
  hour_ct int;
  day_sum int;
  lvl int;
  cur int;
  m jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then return jsonb_build_object('error', 'invalid'); end if;

  begin
    mid := (payload ->> 'id')::uuid;
  exception when others then
    return jsonb_build_object('error', 'invalid');
  end;
  if mid is null then return jsonb_build_object('error', 'invalid'); end if;

  perform public.ensure_profile(uid);
  select * into prof from public.profiles where id = uid for update; -- serializes this player's submissions

  select user_id into existing_user from public.matches where id = mid;
  if found then
    if existing_user <> uid then return jsonb_build_object('error', 'invalid'); end if;
    return jsonb_build_object('result', jsonb_build_object('shells', 0, 'bonus', 0, 'xp', 0, 'level_ups', '[]'::jsonb, 'duplicate', true, 'throttled', false),
                              'profile', public.profile_json(uid));
  end if;

  -- Plausibility: reject nonsense without paying anything.
  v_mode := payload ->> 'mode';
  v_diff := payload ->> 'difficulty';
  v_result := payload ->> 'result';
  if v_result is null or v_result not in ('win', 'loss', 'draw') then return jsonb_build_object('error', 'invalid'); end if;
  if v_diff is null or v_diff not in ('easy', 'normal', 'hard') then return jsonb_build_object('error', 'invalid'); end if;
  if public.jnum(payload, 'bots') is null or public.jnum(payload, 'rounds') is null
     or public.jnum(payload, 'survived') is null or public.jnum(payload, 'kills') is null then
    return jsonb_build_object('error', 'invalid');
  end if;
  v_bots := public.clamp_int(public.jnum(payload, 'bots'), -1000, 1000);
  v_rounds := public.clamp_int(public.jnum(payload, 'rounds'), -1000, 1000);
  v_surv := public.clamp_int(public.jnum(payload, 'survived'), -1000, 1000);
  v_kills := public.clamp_int(public.jnum(payload, 'kills'), -1000, 1000);
  if v_bots < 1 or v_bots > 5 then return jsonb_build_object('error', 'invalid'); end if;
  if v_rounds < 1 or v_rounds > 60 then return jsonb_build_object('error', 'invalid'); end if;
  if v_surv < 0 or v_surv > v_rounds then return jsonb_build_object('error', 'invalid'); end if;
  if v_kills < 0 or v_kills > v_bots then return jsonb_build_object('error', 'invalid'); end if;
  if v_result = 'win' and v_surv <> v_rounds then return jsonb_build_object('error', 'invalid'); end if;
  if v_mode is null or not public.econ_known_mode(v_mode) then v_mode := 'Custom'; end if;
  v_ver := left(coalesce(payload ->> 'v', ''), 20);
  v_played := to_timestamp(least(greatest(coalesce(public.jnum(payload, 'at'), 0), 0), 4000000000000)::double precision / 1000.0);
  v_played := least(now() + interval '5 minutes', greatest(now() - interval '7 days', v_played));

  -- Rate limits: matches over a limit are still recorded but pay nothing.
  select count(*) into hour_ct from public.matches where user_id = uid and created_at > now() - interval '1 hour';
  select coalesce(sum(shells), 0) into day_sum from public.matches where user_id = uid and created_at >= date_trunc('day', now());
  xp_gain := public.calc_xp(v_result, v_rounds, v_surv, v_kills);
  pay := public.calc_payout(v_mode, v_bots, v_diff, v_result, v_rounds, v_surv, v_kills);
  if hour_ct >= public.econ_const('matches_per_hour') then
    throttled := true; pay := 0; xp_gain := 0;
  elsif day_sum >= public.econ_const('shells_per_day') then
    throttled := true; pay := 0;
  else
    pay := least(pay, public.econ_const('shells_per_day') - day_sum);
  end if;

  -- XP and level-ups
  lvl := prof.level;
  cur := prof.xp + xp_gain;
  while lvl < public.econ_const('max_level') and cur >= public.econ_xp_needed(lvl) loop
    cur := cur - public.econ_xp_needed(lvl);
    bonus := bonus + public.econ_level_bonus(lvl);
    lvl := lvl + 1;
    ups := ups || jsonb_build_array(jsonb_build_object('level', lvl, 'bonus', public.econ_level_bonus(lvl - 1)));
  end loop;
  if lvl >= public.econ_const('max_level') then cur := 0; end if;

  update public.profiles
     set shells = shells + pay + bonus, total_earned = total_earned + pay + bonus, xp = cur, level = lvl, last_seen = now()
   where id = uid;

  -- Stats (same rules as recordMatch in src/stats.ts)
  insert into public.player_stats (user_id) values (uid) on conflict do nothing;
  select * into st from public.player_stats where user_id = uid for update;
  m := coalesce(st.modes -> v_mode, '{"played":0,"wins":0,"losses":0,"draws":0,"bestSurvived":0}'::jsonb);
  m := jsonb_build_object(
    'played', (m ->> 'played')::int + 1,
    'wins', (m ->> 'wins')::int + (case when v_result = 'win' then 1 else 0 end),
    'losses', (m ->> 'losses')::int + (case when v_result = 'loss' then 1 else 0 end),
    'draws', (m ->> 'draws')::int + (case when v_result = 'draw' then 1 else 0 end),
    'bestSurvived', greatest((m ->> 'bestSurvived')::int, v_surv));
  update public.player_stats set
    played = played + 1,
    wins = wins + (case when v_result = 'win' then 1 else 0 end),
    losses = losses + (case when v_result = 'loss' then 1 else 0 end),
    draws = draws + (case when v_result = 'draw' then 1 else 0 end),
    kills = kills + v_kills,
    streak = case v_result when 'win' then streak + 1 when 'loss' then 0 else streak end,
    best_streak = greatest(best_streak, case v_result when 'win' then streak + 1 else 0 end),
    best_survived = greatest(best_survived, v_surv),
    modes = modes || jsonb_build_object(v_mode, m)
  where user_id = uid;

  insert into public.matches (id, user_id, mode, bots, difficulty, result, rounds, survived, kills, shells, xp, played_at, client_version)
  values (mid, uid, v_mode, v_bots, v_diff, v_result, v_rounds, v_surv, v_kills, pay + bonus, xp_gain, v_played, nullif(v_ver, ''));

  return jsonb_build_object(
    'result', jsonb_build_object('shells', pay, 'bonus', bonus, 'xp', xp_gain, 'level_ups', ups, 'duplicate', false, 'throttled', throttled),
    'profile', public.profile_json(uid));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Shop RPCs
-- ---------------------------------------------------------------------------------------------
create or replace function public.buy_item(item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  item public.shop_items%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_profile(uid);
  select * into prof from public.profiles where id = uid for update;
  select * into item from public.shop_items where id = item_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown', 'profile', public.profile_json(uid)); end if;

  if exists (select 1 from public.inventory where user_id = uid and public.inventory.item_id = item.id) then
    update public.profiles set equipped = equipped || jsonb_build_object(item.category, item.id) where id = uid;
    return jsonb_build_object('ok', true, 'profile', public.profile_json(uid));
  end if;
  if prof.shells < item.price then
    return jsonb_build_object('ok', false, 'error', 'need_more', 'missing', item.price - prof.shells, 'profile', public.profile_json(uid));
  end if;
  insert into public.inventory (user_id, item_id) values (uid, item.id);
  update public.profiles
     set shells = shells - item.price, equipped = equipped || jsonb_build_object(item.category, item.id)
   where id = uid;
  return jsonb_build_object('ok', true, 'profile', public.profile_json(uid));
end;
$$;

create or replace function public.equip_item(item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  item public.shop_items%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_profile(uid);
  select * into item from public.shop_items where id = item_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown', 'profile', public.profile_json(uid)); end if;
  if not exists (select 1 from public.inventory where user_id = uid and public.inventory.item_id = item.id) then
    return jsonb_build_object('ok', false, 'error', 'not_owned', 'profile', public.profile_json(uid));
  end if;
  update public.profiles set equipped = equipped || jsonb_build_object(item.category, item.id) where id = uid;
  return jsonb_build_object('ok', true, 'profile', public.profile_json(uid));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- import_local_progress v2: one-time, monotonic merge of a local save (guest save at first sign-in, or the
-- progress a 0.7.x account made on this device before cloud sync existed). Never lowers server values, so
-- running it from a device with an empty save cannot wipe anything. Limits (keep in sync with src/merge.ts):
--   Shells <= 3000, total earned <= 20000, paid items worth <= 15000, total XP <= 2x total earned.
-- ---------------------------------------------------------------------------------------------
create or replace function public.import_local_progress(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  st public.player_stats%rowtype;
  shells_in int := 0;
  earned_in int := 0;
  spent int := 0;
  budget int;
  item record;
  cat record;
  mrow record;
  eq jsonb;
  pick text;
  nm text;
  split int[];
  total_in int := 0;
  total_now int;
  s jsonb;
  w int; l int; d int; p int; bs int; mm jsonb := '{}'::jsonb; mw int; ml int; md int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_profile(uid);
  select * into prof from public.profiles where id = uid for update;
  if prof.reconciled then return public.profile_json(uid); end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then payload := '{}'::jsonb; end if;

  shells_in := public.clamp_int(public.jnum(payload, 'shells'), 0, 3000);
  earned_in := greatest(public.clamp_int(public.jnum(payload, 'total_earned'), 0, 20000), shells_in);

  -- Items: add the cheapest requested paid items the account lacks, within the value budget.
  select 15000 - coalesce(sum(s2.price), 0) into budget
    from public.inventory i join public.shop_items s2 on s2.id = i.item_id
   where i.user_id = uid and s2.price > 0;
  budget := greatest(budget, 0);
  if jsonb_typeof(payload -> 'owned') = 'array' then
    for item in
      select s2.id, s2.price from public.shop_items s2
       where s2.price > 0
         and s2.id in (select jsonb_array_elements_text(payload -> 'owned'))
         and not exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = s2.id)
       order by s2.price, s2.id
    loop
      if spent + item.price <= budget then
        insert into public.inventory (user_id, item_id) values (uid, item.id) on conflict do nothing;
        spent := spent + item.price;
      end if;
    end loop;
  end if;

  -- Equipped: the local choice when owned, else what the account already has, else the free item.
  eq := prof.equipped;
  for cat in select distinct category from public.shop_items loop
    pick := null;
    if jsonb_typeof(payload -> 'equipped') = 'object' then
      select s2.id into pick from public.shop_items s2
        join public.inventory i on i.item_id = s2.id and i.user_id = uid
       where s2.category = cat.category and s2.id = (payload -> 'equipped' ->> cat.category);
    end if;
    if pick is null then
      select s2.id into pick from public.shop_items s2
        join public.inventory i on i.item_id = s2.id and i.user_id = uid
       where s2.category = cat.category and s2.id = (prof.equipped ->> cat.category);
    end if;
    if pick is null then
      select s2.id into pick from public.shop_items s2 where s2.category = cat.category and s2.price = 0 limit 1;
    end if;
    eq := eq || jsonb_build_object(cat.category, pick);
  end loop;

  -- XP: keep the larger total; local XP is clamped to 2x the (clamped) earned Shells.
  total_in := least(public.econ_total_xp(public.clamp_int(public.jnum(payload, 'level'), 1, public.econ_const('max_level')),
                                         public.clamp_int(public.jnum(payload, 'xp'), 0, 1000000)), 2 * earned_in);
  total_now := greatest(total_in, public.econ_total_xp(prof.level, prof.xp));
  split := public.econ_split_xp(total_now);

  update public.profiles
     set shells = greatest(shells, shells_in),
         total_earned = greatest(total_earned, earned_in, shells, shells_in),
         equipped = eq,
         level = split[1],
         xp = split[2],
         imported = true,
         reconciled = true
   where id = uid;

  -- Keep the guest's chosen name only while the account still has its generated one.
  nm := payload ->> 'name';
  if public.valid_display_name(nm) and lower(nm) <> 'player' and prof.display_name ~ '^(Player[0-9]{4}|P[0-9a-f]{10})$' then
    begin
      update public.profiles set display_name = nm where id = uid;
    exception when unique_violation then
      null; -- keep the generated name
    end;
  end if;

  -- Stats: only when the account has no server-recorded matches yet.
  if jsonb_typeof(payload -> 'stats') = 'object' then
    insert into public.player_stats (user_id) values (uid) on conflict do nothing;
    select * into st from public.player_stats where user_id = uid for update;
    if st.played = 0 then
      s := payload -> 'stats';
      w := public.clamp_int(public.jnum(s, 'wins'), 0, 100000);
      l := public.clamp_int(public.jnum(s, 'losses'), 0, 100000);
      d := public.clamp_int(public.jnum(s, 'draws'), 0, 100000);
      p := greatest(public.clamp_int(public.jnum(s, 'played'), 0, 300000), w + l + d);
      bs := greatest(public.clamp_int(public.jnum(s, 'bestStreak'), 0, 100000), public.clamp_int(public.jnum(s, 'streak'), 0, 100000));
      if jsonb_typeof(s -> 'modes') = 'object' then
        for mrow in select key, value from jsonb_each(s -> 'modes') limit 20 loop
          if public.econ_known_mode(mrow.key) and jsonb_typeof(mrow.value) = 'object' then
            mw := public.clamp_int(public.jnum(mrow.value, 'wins'), 0, 100000);
            ml := public.clamp_int(public.jnum(mrow.value, 'losses'), 0, 100000);
            md := public.clamp_int(public.jnum(mrow.value, 'draws'), 0, 100000);
            mm := mm || jsonb_build_object(mrow.key, jsonb_build_object(
              'played', greatest(public.clamp_int(public.jnum(mrow.value, 'played'), 0, 300000), mw + ml + md),
              'wins', mw, 'losses', ml, 'draws', md,
              'bestSurvived', public.clamp_int(public.jnum(mrow.value, 'bestSurvived'), 0, 60)));
          end if;
        end loop;
      end if;
      update public.player_stats set
        played = p, wins = w, losses = l, draws = d,
        kills = public.clamp_int(public.jnum(s, 'kills'), 0, 1000000),
        streak = least(public.clamp_int(public.jnum(s, 'streak'), 0, 100000), bs),
        best_streak = bs,
        best_survived = public.clamp_int(public.jnum(s, 'bestSurvived'), 0, 60),
        modes = mm
      where user_id = uid;
    end if;
  end if;

  return public.profile_json(uid);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants: browser may call these as a signed-in user only
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.submit_match(jsonb), public.buy_item(text), public.equip_item(text), public.import_local_progress(jsonb),
  public.calc_xp(text, int, int, int), public.calc_payout(text, int, text, text, int, int, int) from public, anon;
grant execute on function public.submit_match(jsonb), public.buy_item(text), public.equip_item(text), public.import_local_progress(jsonb),
  public.calc_xp(text, int, int, int), public.calc_payout(text, int, text, text, int, int, int) to authenticated;
