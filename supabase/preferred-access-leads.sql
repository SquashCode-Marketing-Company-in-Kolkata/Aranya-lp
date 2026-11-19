-- Run in the Supabase SQL Editor.
begin;

create table if not exists public.preferred_access_leads (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  form_source text not null default 'preferred_access' check (form_source = 'preferred_access'),
  name text not null check (btrim(name) <> ''),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email text,
  locality text not null check (btrim(locality) <> ''),
  purchasing_as text not null,
  home_sizes text[] not null check (cardinality(home_sizes) > 0),
  budget text not null,
  purpose text not null,
  timeline text not null,
  funding text not null,
  preview_times text[] not null default '{}',
  party_size text,
  heard_about text not null,
  referred_by text,
  message text,
  consent boolean not null check (consent),
  source_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text
);

alter table public.preferred_access_leads enable row level security;
revoke all privileges on table public.preferred_access_leads from public, anon, authenticated;
grant insert on table public.preferred_access_leads to service_role;

commit;
