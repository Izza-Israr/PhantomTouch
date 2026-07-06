-- Supabase / PostgreSQL schema for PhantomTouch backend
-- Run this in the Supabase SQL editor to create the required tables.

create extension if not exists "pgcrypto";

-- Display timestamp values in Pakistan Standard Time (PST, UTC+05:00) for SQL sessions.
-- Note: timestamptz values are still stored as absolute instants by PostgreSQL.
set timezone to 'Asia/Karachi';
alter database postgres set timezone to 'Asia/Karachi';

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('PATIENT', 'CLINICIAN', 'ADMIN')),
  session_token text,
  last_login timestamptz
);

create table hospitals (
  id uuid primary key default gen_random_uuid(),
  hospital_name text not null,
  regulatory_license text not null unique,
  city text,
  country text,
  created_at timestamptz not null default now()
);

create table clinicians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  hospital_id uuid references hospitals(id) on delete set null,
  full_name text not null,
  medical_specialty text,
  license_number text not null
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  hospital_id uuid references hospitals(id) on delete set null,
  assigned_clinician_id uuid references clinicians(id) on delete set null,
  full_name text not null,
  date_of_birth date,
  amputation_side text not null check (amputation_side in ('LEFT', 'RIGHT', 'BILATERAL')),
  amputation_level text not null,
  missing_fingers text[] not null default '{}',
  skin_tone_slider_hex text not null default '#aa3bff',
  mesh_scale_multiplier numeric not null default 1.0
);

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS missing_fingers text[] not null default '{}';

create table clinical_prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  clinician_id uuid not null references clinicians(id) on delete cascade,
  prescribed_session_duration_seconds integer not null default 300,
  target_spawn_radius numeric not null default 2.0,
  required_hover_dwell_time_ms integer not null default 1000,
  is_active boolean not null default true,
  prescribed_at timestamptz not null default now()
);

create table therapy_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  prescription_id uuid references clinical_prescriptions(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  total_duration_seconds integer not null,
  targets_spawned integer not null default 0,
  targets_hit integer not null default 0,
  accuracy_percentage numeric not null default 0,
  peak_range_of_motion_degrees numeric not null default 0,
  pain_level integer default null check (pain_level is null or (pain_level >= 0 and pain_level <= 10))
);

-- Run this if the table already exists to add the column:
-- ALTER TABLE therapy_sessions ADD COLUMN IF NOT EXISTS pain_level integer check (pain_level is null or (pain_level >= 0 and pain_level <= 10));

-- Ensure runtime DB migrations: add commonly used columns if missing.
ALTER TABLE therapy_sessions
  ADD COLUMN IF NOT EXISTS pain_level integer check (pain_level is null or (pain_level >= 0 and pain_level <= 10));

create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  last_activity_at timestamptz not null default now()
);

create table chat_room_participants (
  chat_room_id uuid not null references chat_rooms(id) on delete cascade,
  participant_id uuid not null references users(id) on delete cascade,
  primary key (chat_room_id, participant_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  message_body text not null,
  is_read boolean not null default false,
  sent_at timestamptz not null default now()
);

create table custom_3d_models (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references clinicians(id) on delete set null,
  patient_id uuid references patients(id) on delete set null,
  model_name text not null,
  file_url text not null,
  file_size_bytes bigint,
  file_format text not null check (file_format in ('glTF', 'GLB')) default 'GLB',
  rigging_nodes_config jsonb,
  created_at timestamptz not null default now()
);

create table kinematic_telemetry (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references therapy_sessions(id) on delete cascade,
  minute_bucket_index integer not null default 0,
  data_stream jsonb not null default '[]'::jsonb
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references users(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null,
  type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
