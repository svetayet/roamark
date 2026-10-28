-- roaMark: начальная схема Supabase.
-- Применяется целиком в SQL Editor (docs/setup.md, Task 13).
-- Модель данных: у владелицы районы, в районах треки, GPX-файлы в приватном бакете gpx.

create type category as enum ('hike','bike','run','ski');

create table districts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  district_id uuid not null references districts(id) on delete restrict,
  category category not null,
  name text not null check (length(trim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 1000),
  distance_km numeric not null,
  original_filename text not null,
  storage_path text not null,
  min_lat double precision, min_lon double precision,
  max_lat double precision, max_lon double precision,
  preview text,
  gpx_parsed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ровно один основной район: при установке флага новому району
-- он снимается у прежнего (приложение делает одиночный UPDATE).
create function assert_single_primary() returns trigger as $$
begin
  if new.is_primary then
    update districts d
      set is_primary = false
      where d.user_id = new.user_id and d.is_primary and d.id <> new.id;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;
create trigger trg_single_primary before insert or update on districts
  for each row execute function assert_single_primary();

-- Регистрация закрыта: первый зарегистрировавшийся = владелец,
-- повторные входы по magic link создают новых пользователей и отклоняются.
create function reject_second_user() returns trigger as $$
begin
  if (select count(*) from auth.users) >= 1 then
    raise exception 'Регистрация закрыта: у приложения уже есть владелец';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public, auth;
create trigger trg_one_owner before insert on auth.users
  for each row execute function reject_second_user();

-- Каждый видит и меняет только своё.
alter table districts enable row level security;
alter table tracks enable row level security;
create policy owner_all_districts on districts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all_tracks on tracks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Приватный бакет GPX: скачивание только по подписанной ссылке владельца.
insert into storage.buckets (id, name, public) values ('gpx','gpx', false)
  on conflict (id) do nothing;
create policy owner_gpx_objects on storage.objects for all
  using (bucket_id = 'gpx' and owner = auth.uid())
  with check (bucket_id = 'gpx' and owner = auth.uid());
