create table if not exists public.trip_groups (
  id text primary key,
  access_key text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_groups_updated_at_idx
  on public.trip_groups (updated_at);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_trip_groups_updated_at on public.trip_groups;

create trigger trg_trip_groups_updated_at
before update on public.trip_groups
for each row execute function public.set_updated_at();
