-- Policies. Helpers are security definer functions in the private schema.
-- (select private.fn()) is cached once per query.

revoke all on all tables in schema public from anon;
grant select on public.branches, public.shift_defs to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.time_logs to authenticated;
grant select, insert, update on public.inventory_items to authenticated;
grant select, insert, delete on public.branch_areas to authenticated;
grant select, insert, delete on public.inventory_counts to authenticated;
grant select, insert, update, delete on public.inventory_lines to authenticated;
grant select, insert, update, delete on public.holidays to authenticated;
grant select, insert, update on public.payroll_adjustments to authenticated;

create policy branches_select on public.branches
  for select to authenticated
  using (true);

create policy shift_defs_select on public.shift_defs
  for select to authenticated
  using (true);

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.sees_all())
    or (
      branch_id is not null
      and branch_id = (select private.my_branch())
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    (select private.sees_all())
    or (
      (select private.my_role()) = 'supervisor'
      and role = 'staff'
      and branch_id = (select private.my_branch())
    )
  )
  with check (
    (select private.sees_all())
    or (
      (select private.my_role()) = 'supervisor'
      and role = 'staff'
      and branch_id = (select private.my_branch())
    )
  );

create policy time_logs_select on public.time_logs
  for select to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.sees_all())
    or (
      (select private.my_role()) = 'supervisor'
      and branch_id = (select private.my_branch())
    )
  );

create policy time_logs_insert on public.time_logs
  for insert to authenticated
  with check (employee_id = (select auth.uid()));

create policy time_logs_update on public.time_logs
  for update to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.sees_all())
    or (
      (select private.my_role()) = 'supervisor'
      and branch_id = (select private.my_branch())
    )
  )
  with check (
    employee_id = (select auth.uid())
    or (select private.sees_all())
    or (
      (select private.my_role()) = 'supervisor'
      and branch_id = (select private.my_branch())
    )
  );

create policy items_select on public.inventory_items
  for select to authenticated
  using (true);

create policy items_write on public.inventory_items
  for all to authenticated
  using ((select private.my_role()) = 'owner')
  with check ((select private.my_role()) = 'owner');

create policy areas_select on public.branch_areas
  for select to authenticated
  using (true);

create policy areas_write on public.branch_areas
  for all to authenticated
  using ((select private.sees_all()))
  with check ((select private.sees_all()));

create policy counts_select on public.inventory_counts
  for select to authenticated
  using (
    (select private.sees_all())
    or branch_id = (select private.my_branch())
  );

create policy counts_insert on public.inventory_counts
  for insert to authenticated
  with check (
    employee_id = (select auth.uid())
    and (
      (select private.sees_all())
      or branch_id = (select private.my_branch())
    )
  );

create policy counts_delete on public.inventory_counts
  for delete to authenticated
  using ((select private.sees_all()));

create policy lines_select on public.inventory_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.inventory_counts c
      where c.id = count_id
    )
  );

create policy lines_insert on public.inventory_lines
  for insert to authenticated
  with check (
    exists (
      select 1 from public.inventory_counts c
      where c.id = count_id
        and c.employee_id = (select auth.uid())
    )
  );

create policy lines_update on public.inventory_lines
  for update to authenticated
  using (
    exists (
      select 1 from public.inventory_counts c
      where c.id = count_id
        and (
          (select private.sees_all())
          or (
            (select private.my_role()) = 'supervisor'
            and c.branch_id = (select private.my_branch())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.inventory_counts c
      where c.id = count_id
        and (
          (select private.sees_all())
          or (
            (select private.my_role()) = 'supervisor'
            and c.branch_id = (select private.my_branch())
          )
        )
    )
  );

create policy lines_delete on public.inventory_lines
  for delete to authenticated
  using ((select private.sees_all()));

create policy holidays_select on public.holidays
  for select to authenticated
  using (true);

create policy holidays_write on public.holidays
  for all to authenticated
  using ((select private.sees_all()))
  with check ((select private.sees_all()));

create policy adjustments_select on public.payroll_adjustments
  for select to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.sees_all())
  );

create policy adjustments_write on public.payroll_adjustments
  for all to authenticated
  using ((select private.sees_all()))
  with check ((select private.sees_all()));
