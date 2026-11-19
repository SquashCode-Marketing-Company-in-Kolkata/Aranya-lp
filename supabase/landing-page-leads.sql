-- Run in the Supabase SQL Editor.
begin;

create table if not exists public.landing_page_leads (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  form_source text not null default 'main_enquiry' check (form_source = 'main_enquiry'),
  name text not null check (btrim(name) <> ''),
  phone text not null check (phone ~ '^[0-9]{10}$'),
  email text not null check (btrim(email) <> ''),
  interest text,
  message text,
  source_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text
);

alter table public.landing_page_leads enable row level security;
revoke all privileges on table public.landing_page_leads from public, anon, authenticated;
grant insert on table public.landing_page_leads to service_role;

commit;
