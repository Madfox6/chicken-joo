# Chicken Joo staff

Mobile-first staff app for the four Chicken Joo branches: Patts, CAA (Las Piñas), Paco, and Valley 1. Time zone is Asia/Manila. Money is Philippine pesos.

Staff clock in and out, count stock, and read their own pay. Supervisors handle their branch. Owners and sub-owners see every branch. A normal shift approves itself. Nothing in the app blocks a clock-in or a count.

The app is a Vite + React + TypeScript PWA. It installs on a phone, keeps clock-ins, clock-outs, and inventory counts in the phone when the signal drops, and syncs them when the network returns. GitHub Pages hosts the static build at `/chicken-joo/`.

## Sign in

An employee code plus a 4-digit PIN.

Supabase passwords must be at least 6 characters, so the PIN is stored as the password `CJ` plus the four digits. PIN `1234` is the password `CJ1234`. The email is `{code}@staff.chickenjoo.local` (the code is lowercased in the email and stored uppercase on the profile). Example: code `OWNER`, PIN `1234`.

## Pay

Calculated in the app from the clock times. The same rules are covered by `npm test`.

- A shift is 9 hours on the clock and pays 8. The extra hour is lunch and is always deducted. Base pay is ₱500.
- Hourly rate is ₱500 / 8. Late and undertime use that rate per minute.
- Grace is 15 minutes. Inside the grace, the deduction is ₱0. Past the grace, every minute is deducted, including the first 15. Clocking in at 8:16 is 16 minutes.
- Daily allowance is set per person (usually ₱50–₱100, and it can be higher). It is paid in full even when someone is late. An approved straight duty pays it twice.
- Supervisor add-on is at most ₱100 per day, including a double shift or two shifts in one day. Staff do not receive it.
- Graveyard night differential is a flat ₱50 per paid shift. PM pays 10% of the hourly rate for 10 PM–1 AM. Mid PM pays 10% for 10 PM–5 AM. Early arrival and an unapproved late clock-out do not add night differential.
- Regular holiday: base × 1.5. Special holiday: base × 1.3. Allowance is not multiplied. Rest day is base × 1.3. Holiday and rest day do not stack; the higher rate is used.
- Overtime is 125% of the hourly rate and is paid only after a supervisor, sub-owner, or owner approves it. Early clock-in is not overtime.
- Straight duty pays a second base, allowance, and night differential only after approval, and only if they stayed past the first shift.
- Open shifts and missed clock-outs with no time are left out of the weekly total.
- Cash advances, SSS, PhilHealth, and Pag-IBIG are amounts the owner types on the payroll screen.
- 13th month accrual is base pay from 1 January through the selected week, divided by 12. Leave balance is a number the owner edits. It is not deducted automatically.
- The payroll week is Sunday through Saturday. Graveyard is logged on the date it starts.

Shifts, at every branch:

| Shift | Hours | Stock count |
| --- | --- | --- |
| AM | 8:00 AM–5:00 PM | Yes |
| Mid AM | 12:00 PM–9:00 PM | No |
| PM | 4:00 PM–1:00 AM | Yes |
| Mid PM | 8:00 PM–5:00 AM | No |
| Graveyard | 11:55 PM–8:55 AM | Yes |

AM checks the previous night’s graveyard end, PM checks that day’s AM end, and graveyard checks that day’s PM end. Usage is start + received − end. If the new start does not match the previous end, the counter can leave a note. The count is never blocked.

## Run it locally

```bash
npm install
npm test
npm run dev
```

The dev server uses the same base path as Pages, so open `http://localhost:5173/chicken-joo/`.

`npm run build` typechecks and writes `dist/`.

## GitHub Pages

1. On GitHub, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Merge this app to `main`. The workflow `.github/workflows/pages.yml` tests, builds, and deploys.
4. The site will be `https://madfox6.github.io/chicken-joo/`.

The base path is `/chicken-joo/` because the repository name is `chicken-joo`. If the repository is renamed, change `base` in `vite.config.ts` and the `start_url` / `scope` in that same file.

On a phone, open the site in Chrome and use **Add to Home screen**. The service worker caches the app shell. Clock-ins, clock-outs (including the selfie), and inventory counts wait in IndexedDB until the phone is online.

## What the coordinator applies in Supabase

Project `https://xbvqeoxbfjlgmkwqfvms.supabase.co`.

There is no service-role key in this repo. Apply the SQL yourself, in this order, in the SQL editor (or `supabase db query --linked -f <file>`):

1. `supabase/migrations/20261112100001_schema.sql`
2. `supabase/migrations/20261112100002_functions.sql`
3. `supabase/migrations/20261112100003_rls.sql`
4. `supabase/migrations/20261112100004_storage.sql`
5. `supabase/migrations/20261112100005_seed.sql`

Run each file once, from top to bottom. Do not stop between file 1 and file 3: after file 1, row level security is on and the API denies every read until the policies in file 3 exist.

File 4 creates a private Storage bucket named `selfies` (8 MB, jpeg/png/webp) and the policies for it. If the bucket insert fails because the storage table has a new required column, create that private bucket in **Storage** with the same limits, then run file 4 again so the policies are created.

File 5 seeds the four branches, five shifts, count areas, and sample inventory items. Sample rows are named “(sample)” and `is_sample` is true. It does not create employees.

Then:

1. **Authentication → Providers → Email**: turn **off** public sign-ups. Staff are created from the app, or the first owner is created in the dashboard. Keep email confirmation from blocking the dashboard user (create them with **Auto Confirm**).
2. **Authentication → Policies**: leave the password minimum at 6 characters, or the `CJ` + PIN mapping will be rejected. No symbol requirement.
3. Deploy the edge functions (they check the caller’s profile; the gateway JWT check is off because current signing keys can reject a valid staff token before the function runs):

```bash
supabase link --project-ref xbvqeoxbfjlgmkwqfvms
supabase functions deploy create-employee
supabase functions deploy reset-pin
```

The hosted function receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on its own. Do not put the service role key in the app.

### Create the first owner

1. **Authentication → Users → Add user**.
2. Email: `owner@staff.chickenjoo.local`
3. Password: `CJ1234` (this PIN is `1234`)
4. Turn on **Auto Confirm**.
5. The trigger makes the first profile an owner. Employee code is `OWNER`.
6. Open the app and sign in with code `OWNER` and PIN `1234`.
7. Change that PIN from **Employees** after you are in.

If a different user was created first and became the owner by mistake:

```sql
update public.profiles
set role = 'owner', branch_id = null
where employee_code = 'OWNER';
```

Keep at least one owner. The database will not let you demote the last one.

### After that

Owners add everyone else in **Employees**. A supervisor can add staff and reset staff PINs for their own branch. Sub-owners can manage the company except another owner’s record. Owners edit inventory items, holidays, and payroll.

Areas seeded:

- Patts and CAA and Valley 1: cashier and kitchen
- Paco: one combined cashier/kitchen area

Owners can add or remove areas on the Stock screen.

## Roles

| | Staff | Supervisor | Sub-owner | Owner |
| --- | --- | --- | --- | --- |
| Clock and count | Own branch | Own branch | Any branch | Any branch |
| Approvals, missed clock-outs, attendance | | Own branch | All | All |
| Employees | | Staff at their branch | All except owners | All |
| Holidays and payroll | | | Yes | Yes |
| Inventory items | | | | Yes |

GPS is stored as a warning when it is missing or rough. It never stops a clock-in. A selfie is requested and stored in the `selfies` bucket; skipping it or a failed upload does not stop the clock-in. A forgotten clock-out is marked for review and the next clock-in proceeds. One inventory count per area, per counting shift, per phase: the first save wins and everyone else sees “Already counted”.

## Useful checks

```bash
npm test
npm run build
```
