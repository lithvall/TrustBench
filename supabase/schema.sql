-- TrustBench Supabase Schema
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Providers table: all discovered x402 endpoints
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  url text unique not null,
  name text not null,
  capability text not null check (capability in ('search', 'inference', 'data', 'social', 'infra', 'other')),
  description text,
  pay_to text,
  metadata jsonb default '{}',
  last_crawled_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Probes: raw performance measurements (nightly or on-demand)
create table if not exists probes (
  id bigserial primary key,
  provider_id uuid not null references providers(id) on delete cascade,
  timestamp timestamptz default now(),
  latency_ms integer,
  status text not null check (status in ('success', 'error', 'timeout', '402', 'paid_success')),
  http_status integer,
  error text,
  region text default 'global',
  response_time_ms integer,
  response_headers jsonb,
  request_type text default 'probe'  -- 'probe' | 'paid_test'
);

-- Scorecards: aggregated reputation scores (updated nightly by prober/aggregator)
create table if not exists scorecards (
  provider_id uuid primary key references providers(id) on delete cascade,
  capability text not null,
  score numeric(5,2) default 50.00,  -- 0-100 composite
  latency_p50 numeric(8,2),
  latency_p95 numeric(8,2),
  uptime_7d numeric(5,2) default 100.00,
  success_rate_7d numeric(5,2) default 100.00,
  total_probes_7d integer default 0,
  last_updated timestamptz default now(),
  signature text,  -- EIP-712 signature for trust
  metadata jsonb default '{}'
);

-- Indexes for performance
create index if not exists idx_providers_capability on providers(capability);
create index if not exists idx_probes_provider_timestamp on probes(provider_id, timestamp desc);
create index if not exists idx_scorecards_capability_score on scorecards(capability, score desc);
create index if not exists idx_scorecards_last_updated on scorecards(last_updated desc);

-- Function to update scorecard from recent probes (call nightly)
create or replace function update_scorecard(p_provider_id uuid)
returns void as $$
declare
  v_capability text;
  v_p50 numeric;
  v_p95 numeric;
  v_uptime numeric;
  v_success_rate numeric;
  v_total integer;
begin
  select capability into v_capability from providers where id = p_provider_id;
  
  -- Compute stats from last 7 days probes
  with recent as (
    select 
      latency_ms,
      status,
      timestamp
    from probes 
    where provider_id = p_provider_id 
      and timestamp > now() - interval '7 days'
  ),
  stats as (
    select 
      percentile_cont(0.5) within group (order by latency_ms) as p50,
      percentile_cont(0.95) within group (order by latency_ms) as p95,
      count(*) filter (where status in ('success', '402', 'paid_success')) * 100.0 / nullif(count(*), 0) as success_rate,
      count(*) as total_probes
    from recent
  )
  select 
    coalesce(p50, 0), 
    coalesce(p95, 0), 
    coalesce(success_rate, 100),
    coalesce(total_probes, 0)
  into v_p50, v_p95, v_success_rate, v_total
  from stats;

  -- Simple score formula: 40% uptime/success + 30% low latency (inverse) + 30% volume/quality proxy
  -- For MVP: base 60 + uptime bonus - latency penalty
  insert into scorecards (provider_id, capability, score, latency_p50, latency_p95, uptime_7d, success_rate_7d, total_probes_7d, last_updated)
  values (
    p_provider_id, 
    v_capability,
    greatest(0, least(100, 
      50 
      + (v_success_rate - 80) * 0.5   -- success bonus/penalty
      - (v_p50 / 100)                  -- latency penalty (ms/100)
      + (v_total / 10)                 -- activity bonus
    )),
    v_p50,
    v_p95,
    v_success_rate,
    v_success_rate,
    v_total,
    now()
  )
  on conflict (provider_id) do update set
    score = excluded.score,
    latency_p50 = excluded.latency_p50,
    latency_p95 = excluded.latency_p95,
    uptime_7d = excluded.uptime_7d,
    success_rate_7d = excluded.success_rate_7d,
    total_probes_7d = excluded.total_probes_7d,
    last_updated = now();
end;
$$ language plpgsql;

-- Trigger to auto-update on new probe (optional, for real-time)
create or replace function trigger_update_scorecard()
returns trigger as $$
begin
  perform update_scorecard(new.provider_id);
  return new;
end;
$$ language plpgsql;

create trigger if not exists after_probe_insert
after insert on probes
for each row execute function trigger_update_scorecard();

-- RLS policies (for public read)
alter table providers enable row level security;
alter table scorecards enable row level security;
alter table probes enable row level security;

create policy "Public read providers" on providers for select using (true);
create policy "Public read scorecards" on scorecards for select using (true);
create policy "Service role full access" on providers for all using (auth.role() = 'service_role');
create policy "Service role full access scorecards" on scorecards for all using (auth.role() = 'service_role');
create policy "Service role full access probes" on probes for all using (auth.role() = 'service_role');