-- Foundational Admin account schema.
-- This migration must run before any migration that creates an admin_user_id
-- foreign key or otherwise reads public.admin_users.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'ADMIN',
  two_factor_required boolean not null default true,
  two_factor_enabled boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_reset_required boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Authenticated users can read admin users" on public.admin_users;
create policy "Authenticated users can read admin users"
on public.admin_users for select
to authenticated
using (true);
