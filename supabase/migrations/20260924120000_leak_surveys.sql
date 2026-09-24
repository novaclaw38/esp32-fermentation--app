-- Leak Sniffer surveys (leak-sniffer/README.md).
--
-- The sniffer itself never talks to Supabase: it streams to the browser over
-- Bluetooth, and the signed-in user saves the survey from the dashboard's
-- Sniffer page. So there's no device secret or ingest RPC here, just plain
-- owner-scoped tables under RLS.
--
-- A survey is one job (one property / pipe run). Points are the spots the
-- operator marked while sweeping: the response at that spot plus the phone's
-- GPS fix, so the peak can be found again and handed to whoever digs.

create table if not exists leak_surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  site_address text check (char_length(site_address) <= 300),
  notes text check (char_length(notes) <= 4000),
  -- BLE name of the sniffer used, e.g. LeakSniffer-1A2B.
  sniffer_name text check (char_length(sniffer_name) <= 40),
  -- Clean-air baseline resistance at the time of the survey, in ohms. Kept so
  -- responses from different surveys can be compared with the same sensor.
  baseline_r0_ohm real check (baseline_r0_ohm > 0),
  created_at timestamptz not null default now()
);

create table if not exists leak_survey_points (
  id bigint generated always as identity primary key,
  survey_id uuid not null references leak_surveys(id) on delete cascade,
  label text check (char_length(label) <= 120),
  -- R0/Rs: 1.0 = clean air, higher = more hydrogen.
  response real not null check (response > 0),
  -- Only set when the sniffer was calibrated against a reference gas.
  ppm real check (ppm >= 0),
  rs_ohm real check (rs_ohm > 0),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_m real check (accuracy_m >= 0),
  temp_c real,
  rh_pct real check (rh_pct between 0 and 100),
  suspected_leak boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists leak_surveys_user_created_idx
  on leak_surveys (user_id, created_at desc);
create index if not exists leak_survey_points_survey_idx
  on leak_survey_points (survey_id, created_at);

alter table leak_surveys enable row level security;
alter table leak_survey_points enable row level security;

create policy "users select own surveys" on leak_surveys
  for select to authenticated
  using (user_id = auth.uid());

create policy "users insert own surveys" on leak_surveys
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "users update own surveys" on leak_surveys
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own surveys" on leak_surveys
  for delete to authenticated
  using (user_id = auth.uid());

create policy "users select own survey points" on leak_survey_points
  for select to authenticated
  using (exists (
    select 1 from leak_surveys s
    where s.id = leak_survey_points.survey_id and s.user_id = auth.uid()
  ));

create policy "users insert own survey points" on leak_survey_points
  for insert to authenticated
  with check (exists (
    select 1 from leak_surveys s
    where s.id = leak_survey_points.survey_id and s.user_id = auth.uid()
  ));

create policy "users update own survey points" on leak_survey_points
  for update to authenticated
  using (exists (
    select 1 from leak_surveys s
    where s.id = leak_survey_points.survey_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from leak_surveys s
    where s.id = leak_survey_points.survey_id and s.user_id = auth.uid()
  ));

create policy "users delete own survey points" on leak_survey_points
  for delete to authenticated
  using (exists (
    select 1 from leak_surveys s
    where s.id = leak_survey_points.survey_id and s.user_id = auth.uid()
  ));

revoke all on leak_surveys from anon;
revoke all on leak_survey_points from anon;
