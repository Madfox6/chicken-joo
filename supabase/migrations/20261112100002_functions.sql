-- Helpers, triggers, and the inventory submit function.
-- Pay rates live in src/lib/pay.ts. Minute math here mirrors src/lib/shifts.ts
-- so a late clock-in still lands in the approval queue.
-- Grace is 15 minutes. Past grace, the status treats the whole late as an issue.

create or replace function private.positive_minutes(p_from timestamptz, p_to timestamptz)
returns integer
language sql
immutable
as $$
  select greatest(0, floor(extract(epoch from (p_to - p_from)) / 60.0)::integer);
$$;

create or replace function private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function private.my_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select branch_id from public.profiles where id = (select auth.uid());
$$;

create or replace function private.sees_all()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() in ('owner', 'sub_owner'), false);
$$;

create or replace function private.work_date_for(p_shift text, p_clock timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp;
  v_time time;
  v_date date;
  v_end time;
  v_crosses boolean;
begin
  v_local := p_clock at time zone 'Asia/Manila';
  v_date := v_local::date;
  v_time := v_local::time;
  select d.end_time, d.crosses_midnight into v_end, v_crosses
  from public.shift_defs d
  where d.code = p_shift;
  if v_end is null then
    raise exception 'Unknown shift';
  end if;
  if p_shift = 'graveyard' then
    if v_time < time '12:00' then
      return v_date - 1;
    end if;
    return v_date;
  end if;
  if v_crosses and v_time < v_end then
    return v_date - 1;
  end if;
  return v_date;
end;
$$;

create or replace function private.classify_attendance(
  p_work_date date,
  p_shift text,
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_straight boolean,
  out late_minutes integer,
  out undertime_minutes integer,
  out ot_minutes integer,
  out worked_past boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start_time time;
  v_end_time time;
  v_crosses boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_double timestamptz;
begin
  select d.start_time, d.end_time, d.crosses_midnight
    into v_start_time, v_end_time, v_crosses
  from public.shift_defs d
  where d.code = p_shift;
  if v_start_time is null then
    raise exception 'Unknown shift';
  end if;
  v_start := (p_work_date + v_start_time) at time zone 'Asia/Manila';
  v_end := ((p_work_date + (case when v_crosses then 1 else 0 end)) + v_end_time) at time zone 'Asia/Manila';
  v_double := v_end + interval '9 hours';
  late_minutes := private.positive_minutes(v_start, p_clock_in);
  worked_past := p_clock_out is not null and p_clock_out > v_end;
  if p_clock_out is null then
    undertime_minutes := 0;
    ot_minutes := 0;
  elsif p_clock_out < v_end then
    undertime_minutes := private.positive_minutes(p_clock_out, v_end);
    ot_minutes := 0;
  elsif p_straight then
    undertime_minutes := 0;
    ot_minutes := private.positive_minutes(v_double, p_clock_out);
  else
    undertime_minutes := 0;
    ot_minutes := private.positive_minutes(v_end, p_clock_out);
  end if;
end;
$$;

create or replace function private.time_log_status(
  p_clock_out timestamptz,
  p_missed boolean,
  p_late integer,
  p_under integer,
  p_ot integer,
  p_ot_approved boolean,
  p_ot_rejected boolean,
  p_straight boolean,
  p_straight_approved boolean,
  p_straight_rejected boolean,
  p_late_waived boolean,
  p_under_waived boolean,
  p_reviewed boolean
)
returns text
language plpgsql
immutable
as $$
declare
  open_issue boolean;
begin
  if p_missed and p_clock_out is null then
    return 'needs_review';
  end if;
  if p_clock_out is null then
    return 'open';
  end if;
  if p_reviewed then
    return 'approved';
  end if;
  open_issue :=
    (p_late > 15 and not p_late_waived)
    or (p_under > 15 and not p_under_waived)
    or (p_ot > 0 and not p_ot_approved and not p_ot_rejected)
    or (p_straight and not p_straight_approved and not p_straight_rejected);
  if open_issue then
    return 'pending';
  end if;
  if p_ot_approved or p_ot_rejected or p_straight_approved or p_straight_rejected
     or p_late_waived or p_under_waived then
    return 'approved';
  end if;
  return 'auto_approved';
end;
$$;

create or replace function private.previous_count_slot(p_shift text, p_date date)
returns table (shift text, work_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case p_shift when 'am' then 'graveyard' when 'pm' then 'am' else 'pm' end,
    case when p_shift = 'am' then (p_date - 1) else p_date end;
$$;

create or replace function private.tg_time_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_past boolean;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is null then
      raise exception 'Sign in first';
    end if;
    if not coalesce((select active from public.profiles where id = (select auth.uid())), false) then
      raise exception 'This account is inactive';
    end if;
    if new.clock_in is null or new.clock_in > now() + interval '2 minutes' then
      new.clock_in := now();
    end if;
    new.employee_id := (select auth.uid());
    new.ot_approved := false;
    new.ot_rejected := false;
    new.straight_duty_approved := false;
    new.straight_duty_rejected := false;
    new.late_waived := false;
    new.undertime_waived := false;
    new.issues_reviewed := false;
    new.missed_clock_out := false;
    new.is_rest_day := false;
    new.clock_out := null;
    new.work_date := private.work_date_for(new.shift_code, new.clock_in);

    update public.time_logs
      set missed_clock_out = true
      where employee_id = new.employee_id
        and clock_out is null
        and missed_clock_out = false;

    select c.late_minutes, c.undertime_minutes, c.ot_minutes
      into new.late_minutes, new.undertime_minutes, new.ot_minutes
    from private.classify_attendance(new.work_date, new.shift_code, new.clock_in, null, new.is_straight_duty) c;
    new.status := 'open';
    return new;
  end if;

  v_role := coalesce(private.my_role(), '');
  new.id := old.id;
  new.client_id := old.client_id;
  new.employee_id := old.employee_id;
  new.created_at := old.created_at;
  new.clock_in := old.clock_in;
  new.is_straight_duty := old.is_straight_duty;
  new.gps_in_lat := old.gps_in_lat;
  new.gps_in_lng := old.gps_in_lng;
  new.gps_in_warning := old.gps_in_warning;
  if old.selfie_in_path is not null then
    new.selfie_in_path := old.selfie_in_path;
  end if;
  if old.selfie_out_path is not null then
    new.selfie_out_path := old.selfie_out_path;
  end if;

  if v_role not in ('owner', 'sub_owner', 'supervisor') then
    if old.clock_out is not null then
      return old;
    end if;
    new.shift_code := old.shift_code;
    new.work_date := old.work_date;
    new.branch_id := old.branch_id;
    new.is_rest_day := old.is_rest_day;
    new.ot_approved := old.ot_approved;
    new.ot_rejected := old.ot_rejected;
    new.straight_duty_approved := old.straight_duty_approved;
    new.straight_duty_rejected := old.straight_duty_rejected;
    new.late_waived := old.late_waived;
    new.undertime_waived := old.undertime_waived;
    new.issues_reviewed := old.issues_reviewed;
    new.review_note := old.review_note;
    if not (new.missed_clock_out and old.clock_out is null and new.clock_out is null) then
      new.missed_clock_out := old.missed_clock_out;
    end if;
  end if;

  if new.clock_out is not null and new.clock_out < new.clock_in then
    raise exception 'Clock-out is before clock-in';
  end if;
  if new.clock_out is not null then
    new.missed_clock_out := false;
  end if;

  select c.late_minutes, c.undertime_minutes, c.ot_minutes, c.worked_past
    into new.late_minutes, new.undertime_minutes, new.ot_minutes, v_past
  from private.classify_attendance(
    new.work_date, new.shift_code, new.clock_in, new.clock_out, new.is_straight_duty
  ) c;

  new.status := private.time_log_status(
    new.clock_out,
    new.missed_clock_out,
    new.late_minutes,
    new.undertime_minutes,
    new.ot_minutes,
    new.ot_approved,
    new.ot_rejected,
    new.is_straight_duty and coalesce(v_past, false),
    new.straight_duty_approved,
    new.straight_duty_rejected,
    new.late_waived,
    new.undertime_waived,
    new.issues_reviewed
  );
  return new;
end;
$$;

create trigger tg_time_log
  before insert or update on public.time_logs
  for each row execute function private.tg_time_log();

create or replace function private.tg_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.supervisor_addon > 100 then
    new.supervisor_addon := 100;
  end if;
  if new.supervisor_addon < 0 then
    new.supervisor_addon := 0;
  end if;
  if new.daily_allowance < 0 then
    new.daily_allowance := 0;
  end if;

  if old.role = 'owner' and new.role is distinct from 'owner' then
    if (select count(*) from public.profiles where role = 'owner' and id <> old.id) = 0 then
      raise exception 'Keep at least one owner';
    end if;
  end if;

  if (select auth.uid()) is null then
    return new;
  end if;

  if private.my_role() = 'sub_owner' and (old.role = 'owner' or new.role = 'owner') then
    raise exception 'Only an owner can edit an owner';
  end if;

  if private.my_role() = 'supervisor' then
    if old.role <> 'staff' then
      raise exception 'Supervisors can only edit staff';
    end if;
    new.role := 'staff';
    new.branch_id := old.branch_id;
    new.supervisor_addon := old.supervisor_addon;
    new.leave_balance := old.leave_balance;
    new.employee_code := old.employee_code;
  end if;

  if new.role in ('staff', 'supervisor') and new.branch_id is null then
    raise exception 'Staff and supervisors need a branch';
  end if;

  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger tg_profile
  before insert or update on public.profiles
  for each row execute function private.tg_profile();

create or replace function private.tg_inventory_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.count_id := old.count_id;
  new.item_id := old.item_id;
  new.quantity := old.quantity;
  new.received := old.received;
  new.previous_end := old.previous_end;
  new.variance_delta := old.variance_delta;
  new.variance_note := old.variance_note;
  return new;
end;
$$;

create trigger tg_inventory_line
  before update on public.inventory_lines
  for each row execute function private.tg_inventory_line();

-- The first Auth user becomes the owner. Later users take the role stored in
-- app_metadata by the create-employee edge function. Public sign-up should stay off.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_role text;
  v_name text;
  v_branch uuid;
  v_allowance numeric;
  v_addon numeric;
begin
  perform pg_advisory_xact_lock(hashtext('chicken-joo-first-owner'));
  v_code := upper(split_part(coalesce(new.email, 'user'), '@', 1));
  if v_code = '' then
    v_code := 'USER' || left(replace(new.id::text, '-', ''), 8);
  end if;
  if not exists (select 1 from public.profiles where role = 'owner') then
    v_role := 'owner';
  else
    v_role := coalesce(new.raw_app_meta_data->>'role', 'staff');
  end if;
  if v_role not in ('staff', 'supervisor', 'sub_owner', 'owner') then
    v_role := 'staff';
  end if;
  v_name := coalesce(nullif(new.raw_app_meta_data->>'full_name', ''), v_code);
  v_branch := null;
  if coalesce(new.raw_app_meta_data->>'branch_id', '') ~* '^[0-9a-f-]{36}$' then
    v_branch := (new.raw_app_meta_data->>'branch_id')::uuid;
  end if;
  v_allowance := greatest(0, coalesce((nullif(new.raw_app_meta_data->>'daily_allowance', ''))::numeric, 50));
  v_addon := least(100, greatest(0, coalesce((nullif(new.raw_app_meta_data->>'supervisor_addon', ''))::numeric, 0)));
  insert into public.profiles (
    id, employee_code, full_name, role, branch_id, daily_allowance, supervisor_addon
  ) values (
    new.id, v_code, v_name, v_role, v_branch, v_allowance, v_addon
  )
  on conflict (id) do update set
    employee_code = excluded.employee_code,
    full_name = excluded.full_name,
    role = excluded.role,
    branch_id = excluded.branch_id,
    daily_allowance = excluded.daily_allowance,
    supervisor_addon = excluded.supervisor_addon;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.submit_inventory_count(
  p_client_id uuid,
  p_branch_id uuid,
  p_area text,
  p_shift_code text,
  p_work_date date,
  p_phase text,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
  line jsonb;
  prev_shift text;
  prev_date date;
  prev_qty numeric;
  qty numeric;
  received numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first';
  end if;
  if p_shift_code not in ('am', 'pm', 'graveyard') then
    raise exception 'This shift does not count inventory';
  end if;
  if p_phase not in ('start', 'end') then
    raise exception 'Count must be a start or an end';
  end if;
  if not exists (
    select 1 from public.branch_areas a
    where a.branch_id = p_branch_id and a.area = p_area
  ) then
    raise exception 'That area is not used at this branch';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'Add a quantity for each item';
  end if;

  select c.id into new_id
  from public.inventory_counts c
  where c.client_id = p_client_id;
  if new_id is not null then
    return new_id;
  end if;

  select s.shift, s.work_date into prev_shift, prev_date
  from private.previous_count_slot(p_shift_code, p_work_date) s;

  insert into public.inventory_counts (
    client_id, branch_id, area, shift_code, work_date, phase, employee_id
  ) values (
    p_client_id, p_branch_id, p_area, p_shift_code, p_work_date, p_phase, (select auth.uid())
  )
  returning id into new_id;

  for line in select t.value from jsonb_array_elements(p_lines) as t(value)
  loop
    qty := (line->>'quantity')::numeric;
    received := coalesce((line->>'received')::numeric, 0);
    prev_qty := null;
    if p_phase = 'start' then
      select l.quantity into prev_qty
      from public.inventory_lines l
      join public.inventory_counts c on c.id = l.count_id
      where c.branch_id = p_branch_id
        and c.area = p_area
        and c.shift_code = prev_shift
        and c.work_date = prev_date
        and c.phase = 'end'
        and l.item_id = (line->>'item_id')::uuid;
    end if;

    insert into public.inventory_lines (
      count_id, item_id, quantity, received, previous_end, variance_delta, variance_note, variance_ack
    ) values (
      new_id,
      (line->>'item_id')::uuid,
      qty,
      received,
      prev_qty,
      case when prev_qty is null then null else qty - prev_qty end,
      nullif(line->>'variance_note', ''),
      prev_qty is null or qty = prev_qty
    );
  end loop;

  return new_id;
exception
  when unique_violation then
    select c.id into new_id
    from public.inventory_counts c
    where c.client_id = p_client_id;
    if new_id is not null then
      return new_id;
    end if;
    raise exception 'already counted' using errcode = '23505';
end;
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role, supabase_auth_admin;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to authenticated;
revoke all on function private.handle_new_user() from authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin;

revoke all on function public.submit_inventory_count(uuid, uuid, text, text, date, text, jsonb) from public, anon;
grant execute on function public.submit_inventory_count(uuid, uuid, text, text, date, text, jsonb) to authenticated;
