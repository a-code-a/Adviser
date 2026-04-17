create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists pgmq;

create type public.marketplace_name as enum ('ebay', 'kleinanzeigen');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_quotas (
  user_id uuid primary key references public.users (id) on delete cascade,
  import_limit integer not null default 5,
  imports_used_today integer not null default 0,
  imports_window_started_at date not null default current_date,
  refresh_cooldown_hours integer not null default 6,
  tracked_limit integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crawl_targets (
  id uuid primary key default gen_random_uuid(),
  marketplace public.marketplace_name not null,
  source_url text not null unique,
  submitted_by uuid references public.users (id) on delete set null,
  target_kind text not null default 'listing',
  status text not null default 'queued',
  last_crawled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crawl_seeds (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.users (id) on delete set null,
  marketplace public.marketplace_name not null,
  query text not null,
  category text,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crawl_blocks (
  id uuid primary key default gen_random_uuid(),
  crawl_target_id uuid references public.crawl_targets (id) on delete cascade,
  marketplace public.marketplace_name not null,
  source_url text not null,
  reason text not null,
  signature text,
  detected_at timestamptz not null default now()
);

create table public.listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  crawl_target_id uuid not null references public.crawl_targets (id) on delete cascade,
  marketplace public.marketplace_name not null,
  external_id text,
  source_url text not null,
  parser_version text not null,
  parser_signals jsonb not null default '{}'::jsonb,
  raw_html text,
  raw_payload jsonb,
  is_blocked boolean not null default false,
  blocked_reason text,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  seller_key text not null unique,
  marketplace public.marketplace_name not null,
  external_seller_id text,
  profile_url text,
  name text not null,
  location_text text,
  rating_score numeric,
  rating_count integer,
  member_since_text text,
  is_commercial boolean,
  badges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings_normalized (
  id uuid primary key references public.crawl_targets (id) on delete cascade,
  latest_snapshot_id uuid references public.listing_snapshots (id) on delete set null,
  seller_profile_id uuid references public.seller_profiles (id) on delete set null,
  marketplace public.marketplace_name not null,
  external_id text,
  canonical_url text,
  title text,
  description text,
  category_path text[] not null default '{}'::text[],
  currency text not null default 'EUR',
  price_amount numeric,
  shipping_amount numeric,
  price_text text,
  condition text not null default 'unknown',
  availability text not null default 'unknown',
  location_text text,
  published_at timestamptz,
  ends_at timestamptz,
  image_count integer not null default 0,
  primary_image_url text,
  attributes jsonb not null default '{}'::jsonb,
  embedding vector(256),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings_normalized (id) on delete cascade,
  image_url text not null,
  alt_text text,
  position integer not null default 0
);

create table public.tracked_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  listing_id uuid not null references public.crawl_targets (id) on delete cascade,
  tracking_state text not null default 'observed',
  last_refresh_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create table public.comparables (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.crawl_targets (id) on delete cascade,
  source_marketplace public.marketplace_name not null,
  source_url text not null,
  title text not null,
  price_amount numeric not null default 0,
  currency text not null default 'EUR',
  condition text not null default 'unknown',
  similarity_score numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.crawl_targets (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  model_slug text not null default 'google/gemini-3-flash-preview',
  rendered_summary text,
  report_json jsonb not null,
  token_usage_input integer not null default 0,
  token_usage_output integer not null default 0,
  web_search_requests integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  model_slug text not null,
  purpose text not null,
  use_web_search boolean not null default true,
  temperature numeric not null default 0.2,
  max_output_tokens integer not null default 1600,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_controls (
  marketplace public.marketplace_name primary key,
  enabled boolean not null default true,
  seed_enabled boolean not null default true,
  manual_import_enabled boolean not null default true,
  max_concurrency integer not null,
  requests_per_minute integer not null,
  retry_backoff_seconds integer not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.crawl_targets (id) on delete cascade,
  queue_name text not null,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  raw_snapshot_id uuid references public.listing_snapshots (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index listings_normalized_embedding_idx on public.listings_normalized using hnsw (embedding vector_cosine_ops);
create index tracked_listings_user_id_idx on public.tracked_listings (user_id, tracking_state);
create index crawl_targets_status_idx on public.crawl_targets (status, marketplace);
create index analysis_reports_listing_user_idx on public.analysis_reports (listing_id, user_id, created_at desc);
create index crawl_blocks_marketplace_idx on public.crawl_blocks (marketplace, detected_at desc);
create index listing_snapshots_target_id_idx on public.listing_snapshots (crawl_target_id, scraped_at desc);
create index comparables_listing_id_idx on public.comparables (listing_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into public.user_quotas (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger handle_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create trigger touch_users_updated_at
before update on public.users
for each row execute procedure public.touch_updated_at();

create trigger touch_user_quotas_updated_at
before update on public.user_quotas
for each row execute procedure public.touch_updated_at();

create trigger touch_crawl_targets_updated_at
before update on public.crawl_targets
for each row execute procedure public.touch_updated_at();

create trigger touch_crawl_seeds_updated_at
before update on public.crawl_seeds
for each row execute procedure public.touch_updated_at();

create trigger touch_seller_profiles_updated_at
before update on public.seller_profiles
for each row execute procedure public.touch_updated_at();

create trigger touch_listings_normalized_updated_at
before update on public.listings_normalized
for each row execute procedure public.touch_updated_at();

create trigger touch_tracked_listings_updated_at
before update on public.tracked_listings
for each row execute procedure public.touch_updated_at();

create trigger touch_analysis_reports_updated_at
before update on public.analysis_reports
for each row execute procedure public.touch_updated_at();

create trigger touch_ai_model_configs_updated_at
before update on public.ai_model_configs
for each row execute procedure public.touch_updated_at();

create trigger touch_source_controls_updated_at
before update on public.source_controls
for each row execute procedure public.touch_updated_at();

create or replace function public.reset_quota_window(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_quotas
  set imports_used_today = case when imports_window_started_at < current_date then 0 else imports_used_today end,
      imports_window_started_at = case when imports_window_started_at < current_date then current_date else imports_window_started_at end
  where user_id = p_user_id;
end;
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.can_view_listing(p_listing_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tracked_listings
    where listing_id = p_listing_id
      and user_id = auth.uid()
  )
  or exists (
    select 1
    from public.crawl_targets
    where id = p_listing_id
      and submitted_by = auth.uid()
  );
$$;

create or replace function public.app_touch_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  insert into public.users (id, email)
  values (v_user_id, nullif(v_email, ''))
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into public.user_quotas (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.app_import_listing(
  p_source_url text,
  p_marketplace public.marketplace_name
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_listing_id uuid;
  v_import_limit integer;
  v_imports_used integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  perform public.app_touch_current_user();
  perform public.reset_quota_window(v_user_id);

  select import_limit, imports_used_today
  into v_import_limit, v_imports_used
  from public.user_quotas
  where user_id = v_user_id;

  if v_imports_used >= v_import_limit then
    raise exception 'Daily import limit reached';
  end if;

  insert into public.crawl_targets (marketplace, source_url, submitted_by, target_kind, status)
  values (p_marketplace, p_source_url, v_user_id, 'listing', 'queued')
  on conflict (source_url) do update
    set marketplace = excluded.marketplace,
        updated_at = now()
  returning id into v_listing_id;

  insert into public.tracked_listings (user_id, listing_id, tracking_state)
  values (v_user_id, v_listing_id, 'observed')
  on conflict (user_id, listing_id) do nothing;

  update public.user_quotas
  set imports_used_today = imports_used_today + 1
  where user_id = v_user_id;

  perform pgmq.send(
    'import_url',
    jsonb_build_object(
      'attempt', 0,
      'listingId', v_listing_id,
      'marketplace', p_marketplace,
      'requestedBy', v_user_id,
      'sourceUrl', p_source_url
    )
  );

  return v_listing_id;
end;
$$;

create or replace function public.app_track_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_count integer;
  v_tracked_limit integer;
  v_existing_state text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  perform public.app_touch_current_user();

  select tracked_limit
  into v_tracked_limit
  from public.user_quotas
  where user_id = v_user_id;

  select tracking_state
  into v_existing_state
  from public.tracked_listings
  where user_id = v_user_id
    and listing_id = p_listing_id;

  if v_existing_state = 'active' then
    return;
  end if;

  select count(*)
  into v_active_count
  from public.tracked_listings
  where user_id = v_user_id
    and tracking_state = 'active';

  if v_active_count >= v_tracked_limit then
    raise exception 'Tracked listing limit reached';
  end if;

  insert into public.tracked_listings (user_id, listing_id, tracking_state)
  values (v_user_id, p_listing_id, 'active')
  on conflict (user_id, listing_id) do update
    set tracking_state = 'active',
        updated_at = now();
end;
$$;

create or replace function public.app_request_refresh(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_requested timestamptz;
  v_cooldown_hours integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not public.can_view_listing(p_listing_id) then
    raise exception 'Listing not found';
  end if;

  perform public.app_touch_current_user();

  select refresh_cooldown_hours
  into v_cooldown_hours
  from public.user_quotas
  where user_id = v_user_id;

  select last_refresh_requested_at
  into v_last_requested
  from public.tracked_listings
  where user_id = v_user_id
    and listing_id = p_listing_id;

  if v_last_requested is not null and v_last_requested > now() - make_interval(hours => v_cooldown_hours) then
    raise exception 'Refresh cooldown is still active';
  end if;

  update public.tracked_listings
  set last_refresh_requested_at = now()
  where user_id = v_user_id
    and listing_id = p_listing_id;

  perform pgmq.send(
    'refresh_listing',
    jsonb_build_object(
      'attempt', 0,
      'listingId', p_listing_id,
      'reason', 'manual_refresh',
      'requestedBy', v_user_id
    )
  );
end;
$$;

create or replace function public.app_admin_enqueue_seed(
  p_marketplace public.marketplace_name,
  p_query text,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed_id uuid;
begin
  if not public.is_admin_user() then
    raise exception 'Admin access required';
  end if;

  insert into public.crawl_seeds (created_by, marketplace, query, category, status)
  values (auth.uid(), p_marketplace, p_query, p_category, 'queued')
  returning id into v_seed_id;

  perform pgmq.send(
    'crawl_seed',
    jsonb_build_object(
      'attempt', 0,
      'crawlSeedId', v_seed_id,
      'marketplace', p_marketplace,
      'query', p_query,
      'category', p_category,
      'requestedBy', auth.uid()
    )
  );

  return v_seed_id;
end;
$$;

create or replace function public.worker_send_queue(
  p_queue_name text,
  p_message jsonb,
  p_delay_seconds integer default 0
)
returns bigint
language sql
security definer
set search_path = public, pgmq
as $$
  select *
  from pgmq.send(p_queue_name, p_message, p_delay_seconds)
  limit 1;
$$;

create or replace function public.worker_read_queue(
  p_queue_name text,
  p_qty integer default 1,
  p_visibility_timeout integer default 120
)
returns table (
  msg_id bigint,
  read_ct bigint,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb,
  headers jsonb
)
language sql
security definer
set search_path = public, pgmq
as $$
  select *
  from pgmq.read(p_queue_name, p_visibility_timeout, p_qty);
$$;

create or replace function public.worker_archive_message(
  p_queue_name text,
  p_msg_id bigint
)
returns boolean
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.archive(p_queue_name, p_msg_id);
$$;

create or replace function public.worker_due_tracked_listings(p_limit integer default 20)
returns table (
  listing_id uuid
)
language sql
security definer
set search_path = public
as $$
  with due as (
    select tl.id, tl.listing_id
    from public.tracked_listings tl
    join public.user_quotas uq on uq.user_id = tl.user_id
    where tl.tracking_state = 'active'
      and (
        tl.last_refresh_requested_at is null
        or tl.last_refresh_requested_at <= now() - make_interval(hours => uq.refresh_cooldown_hours)
      )
    order by coalesce(tl.last_refresh_requested_at, to_timestamp(0)) asc
    limit p_limit
  ),
  claimed as (
    update public.tracked_listings tl
    set last_refresh_requested_at = now()
    from due
    where tl.id = due.id
    returning tl.listing_id
  )
  select listing_id
  from claimed;
$$;

create or replace function public.admin_queue_metrics()
returns table (
  queue_name text,
  queue_length bigint,
  newest_msg_age_sec integer,
  oldest_msg_age_sec integer,
  total_messages bigint,
  scrape_time timestamptz,
  queue_visible_length bigint
)
language sql
security definer
set search_path = public, pgmq
as $$
  select *
  from pgmq.metrics_all();
$$;

create or replace function public.match_listing_vectors(
  p_listing_id uuid,
  p_match_count integer default 6
)
returns table (
  id uuid,
  marketplace public.marketplace_name,
  title text,
  price_amount numeric,
  currency text,
  canonical_url text,
  condition text,
  similarity_score double precision
)
language sql
security definer
set search_path = public
as $$
  with target as (
    select embedding
    from public.listings_normalized
    where id = p_listing_id
      and embedding is not null
  )
  select candidate.id,
         candidate.marketplace,
         candidate.title,
         candidate.price_amount,
         candidate.currency,
         candidate.canonical_url,
         candidate.condition,
         1 - (candidate.embedding <=> target.embedding) as similarity_score
  from target
  join public.listings_normalized candidate on candidate.id <> p_listing_id
  where candidate.embedding is not null
  order by candidate.embedding <=> target.embedding
  limit p_match_count;
$$;

alter table public.users enable row level security;
alter table public.user_quotas enable row level security;
alter table public.crawl_targets enable row level security;
alter table public.crawl_seeds enable row level security;
alter table public.crawl_blocks enable row level security;
alter table public.listing_snapshots enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.listings_normalized enable row level security;
alter table public.listing_images enable row level security;
alter table public.tracked_listings enable row level security;
alter table public.comparables enable row level security;
alter table public.analysis_reports enable row level security;
alter table public.ai_model_configs enable row level security;
alter table public.source_controls enable row level security;
alter table public.crawl_runs enable row level security;

create policy "users_select_own" on public.users
for select using (id = auth.uid());

create policy "users_update_own" on public.users
for update using (id = auth.uid())
with check (id = auth.uid());

create policy "quotas_select_own" on public.user_quotas
for select using (user_id = auth.uid());

create policy "tracked_listings_own_all" on public.tracked_listings
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "crawl_targets_view_by_membership" on public.crawl_targets
for select using (public.can_view_listing(id));

create policy "crawl_seeds_admin_select" on public.crawl_seeds
for select using (public.is_admin_user());

create policy "crawl_blocks_admin_select" on public.crawl_blocks
for select using (public.is_admin_user());

create policy "snapshots_view_by_membership" on public.listing_snapshots
for select using (public.can_view_listing(crawl_target_id));

create policy "seller_profiles_view_by_membership" on public.seller_profiles
for select using (
  exists (
    select 1
    from public.listings_normalized ln
    where ln.seller_profile_id = seller_profiles.id
      and public.can_view_listing(ln.id)
  )
);

create policy "listings_view_by_membership" on public.listings_normalized
for select using (public.can_view_listing(id));

create policy "listing_images_view_by_membership" on public.listing_images
for select using (public.can_view_listing(listing_id));

create policy "comparables_view_by_membership" on public.comparables
for select using (public.can_view_listing(listing_id));

create policy "analysis_reports_view_own" on public.analysis_reports
for select using (user_id = auth.uid());

create policy "analysis_reports_insert_service_only" on public.analysis_reports
for insert with check (false);

create policy "ai_model_configs_admin_select" on public.ai_model_configs
for select using (public.is_admin_user());

create policy "source_controls_admin_select" on public.source_controls
for select using (public.is_admin_user());

create policy "crawl_runs_admin_select" on public.crawl_runs
for select using (public.is_admin_user());

insert into public.source_controls (
  marketplace,
  enabled,
  seed_enabled,
  manual_import_enabled,
  max_concurrency,
  requests_per_minute,
  retry_backoff_seconds,
  notes
)
values
  ('ebay', true, true, true, 6, 60, 180, 'Prefer Browse API when token is available.'),
  ('kleinanzeigen', true, true, true, 2, 15, 600, 'Browser-based scraping; monitor block events closely.')
on conflict (marketplace) do nothing;

insert into public.ai_model_configs (
  key,
  model_slug,
  purpose,
  use_web_search,
  temperature,
  max_output_tokens
)
values (
  'analysis_default',
  'google/gemini-3-flash-preview',
  'listing_analysis',
  true,
  0.2,
  1600
)
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'import_url') then
    perform pgmq.create('import_url');
  end if;

  if not exists (select 1 from pgmq.list_queues() where queue_name = 'crawl_seed') then
    perform pgmq.create('crawl_seed');
  end if;

  if not exists (select 1 from pgmq.list_queues() where queue_name = 'refresh_listing') then
    perform pgmq.create('refresh_listing');
  end if;

  if not exists (select 1 from pgmq.list_queues() where queue_name = 'analyze_listing') then
    perform pgmq.create('analyze_listing');
  end if;

  if not exists (select 1 from pgmq.list_queues() where queue_name = 'dead_letter') then
    perform pgmq.create('dead_letter');
  end if;
end
$$;

grant execute on function public.app_touch_current_user() to authenticated;
grant execute on function public.app_import_listing(text, public.marketplace_name) to authenticated;
grant execute on function public.app_track_listing(uuid) to authenticated;
grant execute on function public.app_request_refresh(uuid) to authenticated;
grant execute on function public.app_admin_enqueue_seed(public.marketplace_name, text, text) to authenticated;

revoke all on function public.worker_send_queue(text, jsonb, integer) from anon, authenticated;
revoke all on function public.worker_read_queue(text, integer, integer) from anon, authenticated;
revoke all on function public.worker_archive_message(text, bigint) from anon, authenticated;
revoke all on function public.worker_due_tracked_listings(integer) from anon, authenticated;
revoke all on function public.admin_queue_metrics() from anon, authenticated;
revoke all on function public.match_listing_vectors(uuid, integer) from anon, authenticated;
