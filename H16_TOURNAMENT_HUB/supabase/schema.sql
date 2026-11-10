-- H16 TOURNAMENT HUB — Supabase schema
-- Run the entire script in Supabase SQL Editor.
-- Roles are assigned server-side. New accounts always become "member".
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  role text not null default 'member' check (role in ('member','leader','moderator','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'member');
$$;

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null unique,
  game text not null,
  description text,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  game text not null,
  description text,
  prize text,
  format text default 'Guild event',
  starts_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming','live','completed','cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  guild_a uuid references public.guilds(id) on delete set null,
  guild_b uuid references public.guilds(id) on delete set null,
  winner_id uuid references public.guilds(id) on delete set null,
  score_a integer,
  score_b integer,
  evidence_url text,
  submitted_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  tournament_id uuid references public.tournaments(id) on delete set null,
  guild_id uuid references public.guilds(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.guilds enable row level security;
alter table public.tournaments enable row level security;
alter table public.matches enable row level security;
alter table public.hall_of_fame enable row level security;

-- Profiles: users can view public profile basics and edit only their own display name.
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "profile owner updates own profile" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid() and role = public.current_role());

-- Guild directory is public for approved guilds; owners/admins can view their own pending item.
create policy "approved guilds public read" on public.guilds for select to anon, authenticated
using (status = 'approved' or leader_id = auth.uid() or public.current_role() in ('admin','moderator'));
create policy "authenticated users submit guild" on public.guilds for insert to authenticated
with check (leader_id = auth.uid() and status = 'pending');
create policy "guild admins moderate" on public.guilds for update to authenticated
using (public.current_role() in ('admin','moderator'))
with check (public.current_role() in ('admin','moderator'));
create policy "guild leader can update own pending details" on public.guilds for update to authenticated
using (leader_id = auth.uid() and status = 'pending')
with check (leader_id = auth.uid() and status = 'pending');

-- Tournament listings are public. Only admin/moderator can create or change events.
create policy "tournaments public read" on public.tournaments for select to anon, authenticated using (true);
create policy "staff create tournaments" on public.tournaments for insert to authenticated
with check (public.current_role() in ('admin','moderator') and created_by = auth.uid());
create policy "staff update tournaments" on public.tournaments for update to authenticated
using (public.current_role() in ('admin','moderator'))
with check (public.current_role() in ('admin','moderator'));

-- Match submissions: authenticated users can submit for themselves; staff review.
create policy "matches readable by participants or staff" on public.matches for select to authenticated
using (submitted_by = auth.uid() or public.current_role() in ('admin','moderator'));
create policy "users submit own matches" on public.matches for insert to authenticated
with check (submitted_by = auth.uid() and status = 'pending');
create policy "staff review matches" on public.matches for update to authenticated
using (public.current_role() in ('admin','moderator'))
with check (public.current_role() in ('admin','moderator'));

create policy "hall of fame public read" on public.hall_of_fame for select to anon, authenticated using (true);
create policy "staff manage hall of fame" on public.hall_of_fame for all to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Promote the first administrator manually after registering:
-- update public.profiles set role = 'admin' where id = 'YOUR-AUTH-USER-UUID';
-- Do not expose the Supabase service_role key in frontend code.

-- Optional evidence bucket for match screenshots:
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('match-evidence','match-evidence',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "authenticated upload evidence" on storage.objects for insert to authenticated
with check (bucket_id = 'match-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner or staff read evidence" on storage.objects for select to authenticated
using (bucket_id = 'match-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.current_role() in ('admin','moderator')));
