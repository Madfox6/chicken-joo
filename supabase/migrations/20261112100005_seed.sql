-- Branches, the five shifts, count areas, and sample stock.
-- Sample items are marked in the name and in is_sample. Replace them when real
-- items are ready. No employees: the first Auth user becomes the owner.

insert into public.shift_defs (code, label, start_time, end_time, crosses_midnight, counts_inventory, sort_order)
values
  ('am', 'AM', '08:00', '17:00', false, true, 1),
  ('mid_am', 'Mid AM', '12:00', '21:00', false, false, 2),
  ('pm', 'PM', '16:00', '01:00', true, true, 3),
  ('mid_pm', 'Mid PM', '20:00', '05:00', true, false, 4),
  ('graveyard', 'Graveyard', '23:55', '08:55', true, true, 5)
on conflict (code) do nothing;

insert into public.branches (code, name, city)
values
  ('patts', 'Patts', 'Parañaque'),
  ('caa', 'CAA', 'Las Piñas'),
  ('paco', 'Paco', 'Manila'),
  ('valley1', 'Valley 1', 'Metro Manila')
on conflict (code) do nothing;

insert into public.branch_areas (branch_id, area)
select b.id, a.area
from public.branches b
join (
  values
    ('patts', 'cashier'),
    ('patts', 'kitchen'),
    ('caa', 'cashier'),
    ('caa', 'kitchen'),
    ('paco', 'cashier_kitchen'),
    ('valley1', 'cashier'),
    ('valley1', 'kitchen')
) as a(code, area) on a.code = b.code
on conflict (branch_id, area) do nothing;

insert into public.inventory_items (name, unit, is_sample, sort_order)
values
  ('Whole chicken (sample)', 'pc', true, 1),
  ('Chicken wings (sample)', 'kg', true, 2),
  ('Chicken liver (sample)', 'kg', true, 3),
  ('Cooking oil (sample)', 'L', true, 4),
  ('Rice (sample)', 'kg', true, 5),
  ('Softdrinks (sample)', 'pc', true, 6)
on conflict (name) do nothing;

notify pgrst, 'reload schema';
