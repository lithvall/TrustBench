-- TrustBench Clean Minimal Schema (matches current prober + scorer)
create extension if not exists "uuid-ossp";

-- Drop old tables if they exist
drop table if exists scorecards cascade;
drop table if exists probes cascade;
drop table if exists providers cascade;

-- Providers table
create table providers (
  id uuid primary key default gen_random_uuid(),
  url text unique not null,
  name text not null,
  capability text not null,
  description text,
  pay_to text,
  metadata jsonb default '{}',
  last_crawled_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Probes table
create table probes (
  id bigserial primary key,
  provider_id text not null,           -- uses url as key
  timestamp timestamptz default now(),
  latency_ms integer,
  success boolean,
  region text
);

-- Scorecards table
create table scorecards (
  provider_id text primary key,        -- uses url as key
  capability text not null,
  score numeric(5,2) default 40,
  latency_p50 numeric(8,2),
  latency_p95 numeric(8,2),
  uptime_7d numeric(5,2) default 50,
  last_updated timestamptz default now(),
  signature text
);

-- Indexes
create index idx_providers_capability on providers(capability);
create index idx_scorecards_capability_score on scorecards(capability, score desc);

-- RLS
alter table providers enable row level security;
alter table scorecards enable row level security;
alter table probes enable row level security;

create policy "Public read" on providers for select using (true);
create policy "Public read" on scorecards for select using (true);
create policy "Service role full" on providers for all using (auth.role() = 'service_role');
create policy "Service role full" on scorecards for all using (auth.role() = 'service_role');
create policy "Service role full" on probes for all using (auth.role() = 'service_role');

select '✅ Clean minimal schema ready' as status;