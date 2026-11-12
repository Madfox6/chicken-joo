-- Chicken Joo v2 schema. Apply the files in supabase/migrations in filename order.
-- Row level security is turned on here. Policies are in the next files.
-- Until those policies exist, the API cannot read or write these tables.

create schema if not exists private;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  city text not null,
  active boolean not null default true
);

create table public.shift_defs (
  code text primary key,
  label text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null,
  counts_inventory boolean not null,
  sort_order integer not null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_code text not null unique,
  full_name text not null,
  role text not null check (role in ('staff', 'supervisor', 'sub_owner', 'owner')),
  branch_id uuid references public.branches (id),
  daily_allowance numeric(10, 2) not null default 50 check (daily_allowance >= 0),
  supervisor_addon numeric(10, 2) not null default 0 check (supervisor_addon >= 0 and supervisor_addon <= 100),
  leave_balance numeric(6, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_branch_required check (
    role in ('owner', 'sub_owner') or branch_id is not null
  )
);

create table public.time_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid() unique,
  employee_id uuid not null references public.profiles (id),
  branch_id uuid not null references public.branches (id),
  shift_code text not null references public.shift_defs (code),
  work_date date not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  selfie_in_path text,
  selfie_out_path text,
  gps_in_lat double precision,
  gps_in_lng double precision,
  gps_in_warning text,
  gps_out_lat double precision,
  gps_out_lng double precision,
  gps_out_warning text,
  late_minutes integer not null default 0,
  undertime_minutes integer not null default 0,
  ot_minutes integer not null default 0,
  ot_approved boolean not null default false,
  ot_rejected boolean not null default false,
  is_straight_duty boolean not null default false,
  straight_duty_approved boolean not null default false,
  straight_duty_rejected boolean not null default false,
  is_rest_day boolean not null default false,
  late_waived boolean not null default false,
  undertime_waived boolean not null default false,
  missed_clock_out boolean not null default false,
  issues_reviewed boolean not null default false,
  status text not null default 'open' check (
    status in ('open', 'needs_review', 'pending', 'auto_approved', 'approved')
  ),
  review_note text,
  created_at timestamptz not null default now(),
  constraint time_logs_out_after_in check (clock_out is null or clock_out >= clock_in)
);

create unique index time_logs_one_open_idx
  on public.time_logs (employee_id)
  where clock_out is null and missed_clock_out = false;

create index time_logs_employee_date_idx on public.time_logs (employee_id, work_date desc);
create index time_logs_branch_date_idx on public.time_logs (branch_id, work_date desc);
create index time_logs_queue_idx
  on public.time_logs (branch_id, work_date)
  where status in ('pending', 'needs_review');

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'pc',
  is_sample boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.branch_areas (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  area text not null check (area in ('cashier', 'kitchen', 'cashier_kitchen')),
  unique (branch_id, area)
);

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  branch_id uuid not null references public.branches (id),
  area text not null check (area in ('cashier', 'kitchen', 'cashier_kitchen')),
  shift_code text not null check (shift_code in ('am', 'pm', 'graveyard')),
  work_date date not null,
  phase text not null check (phase in ('start', 'end')),
  employee_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (branch_id, area, shift_code, work_date, phase)
);

create index inventory_counts_lookup_idx
  on public.inventory_counts (branch_id, area, shift_code, work_date, phase);

create table public.inventory_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id),
  quantity numeric(12, 3) not null check (quantity >= 0),
  received numeric(12, 3) not null default 0 check (received >= 0),
  previous_end numeric(12, 3),
  variance_delta numeric(12, 3),
  variance_note text,
  variance_ack boolean not null default false,
  unique (count_id, item_id)
);

create index inventory_lines_count_idx on public.inventory_lines (count_id);
create index inventory_lines_variance_idx
  on public.inventory_lines (count_id)
  where variance_ack = false and variance_delta is not null and variance_delta <> 0;

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  kind text not null check (kind in ('regular', 'special'))
);

create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  cash_advance numeric(10, 2) not null default 0 check (cash_advance >= 0),
  sss numeric(10, 2) not null default 0 check (sss >= 0),
  philhealth numeric(10, 2) not null default 0 check (philhealth >= 0),
  pagibig numeric(10, 2) not null default 0 check (pagibig >= 0),
  notes text,
  unique (employee_id, week_start),
  constraint payroll_week_is_sunday check (extract(dow from week_start) = 0)
);

create index payroll_adjustments_week_idx on public.payroll_adjustments (week_start);
create index profiles_branch_idx on public.profiles (branch_id);

alter table public.branches enable row level security;
alter table public.shift_defs enable row level security;
alter table public.profiles enable row level security;
alter table public.time_logs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.branch_areas enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_lines enable row level security;
alter table public.holidays enable row level security;
alter table public.payroll_adjustments enable row level security;

alter table public.branches force row level security;
alter table public.shift_defs force row level security;
alter table public.profiles force row level security;
alter table public.time_logs force row level security;
alter table public.inventory_items force row level security;
alter table public.branch_areas force row level security;
alter table public.inventory_counts force row level security;
alter table public.inventory_lines force row level security;
alter table public.holidays force row level security;
alter table public.payroll_adjustments force row level security;
