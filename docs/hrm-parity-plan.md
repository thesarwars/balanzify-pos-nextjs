# HRM parity plan

Target: bring the Balanzify HRM module to parity with the UltimatePOS HRM reference.
Derived from two adversarial audits of the reference screens against the codebase
(105 + 78 capabilities classified, every gap re-verified against source).

Status key: **P0** ship first · **P1** foundations · **P2** parity · **P3** polish

---

## P0 — Bugs (fix before building anything new)

These are all verified in source. Several are money-correctness, and all are small.
They are listed first because half the module is partly non-functional today, and
several of the parity features below sit directly on top of this code.

| # | Bug | Where | Impact |
|---|-----|-------|--------|
| 1 | Open attendance rows report ~21 hours. `decorateAtt` defaults `nowHM` to the **container** clock while clock-in is written in the **business** timezone. Container is UTC, default tz is Africa/Nairobi (UTC+3), so the span goes negative and wraps +1440. | `backend/routes/hrm.js:270`, `:252`, `:318`; unguarded call sites `:308` (list) and `:382` (summary → payroll hours) | Wrong hours on screen **and** in payroll overtime |
| 2 | Statutory payroll is dead in production. The API client rebuilds the POST body with 8 keys, dropping `statutory_country` and `prorate`. | `frontend/lib/api.ts:4543` | PAYE/NSSF/SHIF/housing levy always 0; remit + statutory-report routes filter `statutoryTotal > 0` so they can never fire |
| 3 | No duplicate guard on payroll — only `@@index([businessId])`, no unique on (business, employee, month), and no pre-existence check. | `backend/prisma/schema.prisma:955`; `backend/routes/hrm.js:833` | A retry pays an employee twice and posts the GL journal twice |
| 4 | `deduction` is silently consumed as advance repayment before anything else. | `backend/routes/hrm.js:862` | Typing a 500 tax deduction settles 500 of an outstanding advance |
| 5 | Leave-type days input writes to the API on every keystroke; backspacing to empty persists **0 days business-wide**. | `frontend/app/(app)/hrm/components/hrm-screen.tsx:556` → `:547` | Silent entitlement corruption; field cannot be cleared and retyped |
| 6 | `employee.status = 'on_leave'` is sticky and date-blind — set on approval regardless of the leave dates, never reverted. | `backend/routes/hrm.js:566` | "On leave" KPI only grows; auto-absent (selects `status:'active'`) permanently skips anyone ever granted leave |
| 7 | Deleting every org unit resurrects the seeded defaults on the next `GET /hrm/org`. | `backend/routes/hrm.js:20-34`, `:145` | Deleted departments/designations reappear |
| 8 | `POST /hrm/attendance/auto-absent` has no `validate()` middleware, and ignores approved leave. | `backend/routes/hrm.js:356` | People on approved leave get marked absent |
| 9 | `DELETE /leave-type/:id` has no in-use guard (its sibling `DELETE /org` does). `Leave.type` is a denormalised string, so deleting a type silently zeroes historical `taken` and dangles `EmployeeLeaveOverride` rows. | `backend/routes/hrm.js:509` | Silent history loss |
| 10 | `POST /leave-type` upserts with no duplicate-name rejection. | `backend/routes/hrm.js:489` | Re-adding "Sick" with 5 days silently cuts everyone's entitlement from 12 |
| 11 | Leave can be filed with blank dates (silently defaulted to today) and with an off-catalog type string, which skips the quota check entirely. `to < from` is accepted. | `backend/validation/schemas.js:463-465`; `backend/routes/hrm.js:542`, `:548` | Quota bypass; 30-day leave displayed as one day |
| 12 | The balance shown in the leave modal (`entitled − taken`) disagrees with the server's admission test (`entitled − taken − pending`). | `backend/routes/hrm.js:469` vs `:543` | Modal says "12 available", save 422s with "Only 0 available" |
| 13 | Payslips are unreachable. `GET /hrm/employee/:id` hardcodes `attendance/leaves/payroll/advances` to `[]`, and the only Print-payslip button lives inside that list. | `backend/routes/hrm.js:100`; `hrm-screen.tsx:802` | `GET /hrm/payslip/:id` and its 7 display toggles have zero UI entry points |
| 14 | No `PUT /hrm/employee/:id` — employees are create-or-delete only. | `backend/routes/hrm.js` | Salary, department, designation, commission frozen after creation |
| 15 | Five `HrmSettings` columns are read by the payroll math but writable by nothing: `overtimeRate`, `workingDays`, `lateDeduction`, `absentDeduction`, `timezone`. | `backend/routes/hrm.js:221` | Every tenant stuck on 1.5×, a 26-day month, and Africa/Nairobi — bug 1 is a direct consequence |
| 16 | `GET /hrm/leave` and `GET /hrm/leave-balance` fetch every row the business ever created, unfiltered and unpaginated. | `backend/routes/hrm.js:518`, `:578` | Degrades without bound |
| 17 | HRM uses 24 glyph/emoji icons and zero `react-icons`. | `hrm-screen.tsx` | Against the house rule |

---

## P1 — Foundations

New models everything else depends on. Build these before the screens.

### 1.1 `Holiday`
`{ id, businessId, name, startDate, endDate, locationId? (null = all), note?, createdAt }`
A holiday is a **date range**, optionally scoped to one location.

Downstream wiring (the expensive half — do it with the model, not later):
- auto-absent must skip holidays
- leave day-counting must skip holidays
- payroll / attendance-summary working-days math must account for them

### 1.2 Weekly off days
Separate concept from `Holiday`, despite the reference calling the field "Holiday" on
the shift form. There is currently **no day-of-week concept anywhere** in the codebase —
auto-absent would mark everyone absent on a Sunday. Store the off days on the shift
template (1.3).

### 1.3 `ShiftTemplate` (replaces the current shift confusion)
Today "shift" means two unrelated inert things: `EmployeeShift` (1:1 per employee,
no name, whose `start`/`end` no code path actually reads) and `RosterShift` (a per-date
slot that drives nothing).

New: `{ id, businessId, name, type: fixed|flexible, startTime, endTime, weeklyOffDays[], autoClockOut }`
plus a join table for employee assignment (many-to-many, replacing the `@unique employeeId`).
Add `shiftId` to `Attendance` so a record remembers which shift it was judged against.

`autoClockOut` needs a job that closes forgotten clock-ins — which also removes the
worst case of bug 1.

### 1.4 `PayComponent`
`{ id, businessId, description, type: earning|deduction, amountType: fixed|percentage, amount, applicableDate, employeeId? (null = everyone) }`

Named, reusable, auto-applied to payroll runs. Today `Payroll` is six anonymous Decimal
buckets retyped by hand each month, and the payslip can only print five compiled-in words.

### 1.5 `PayrollGroup` (batch runs)
`{ id, businessId, name, status, paymentStatus, totalGross, createdById, locationId, createdAt }`
with `Payroll.groupId`.

Today `POST /hrm/payroll` creates **one row for one employee**, hardcodes `status:'paid'`,
and posts the GL journal in the same transaction — no draft state, no separate payment
status, no reversal. The group concept requires making a payroll a two-phase thing
(draft → approve/pay), which is also what bug 3's guard needs.

Also add to `Payroll`: `referenceNo`, `locationId`, `createdById`, and a stored `gross`.

### 1.6 `SalesTargetBand`
`{ id, businessId, userId, fromAmount, toAmount, commissionPercent }` — N bands per user.

This is **not** a monthly target amount. It is a tiered commission table: "if this user
sells between FROM and TO, they earn PERCENT". Three call sites currently multiply a flat
`commissionPercent` against a sales total and must switch to band resolution:
`backend/routes/hrm.js:55`, `backend/routes/combined/reports/core.js:358`,
`backend/routes/combined/reports/sales-rep.js:151`. Two of the three are unbounded in
time; achievement must be bucketed per calendar month.

Keep the flat `commissionPercent` as the fallback when a user has no bands.

### 1.7 Reference numbers
No HRM record has a human-quotable identifier — leave, payroll and todos are all raw UUIDs.
Add `referenceNo` to `Leave`, `Payroll` and `HrTodo`, generated per business inside the
creating transaction, using the prefixes from 1.8.

### 1.8 `HrmSettings` expansion
Reuse the **existing** business-settings prefix bag pattern
(`backend/validation/schemas.js:635-638` already holds `prefix_purchase`, `prefix_expense`, …)
rather than inventing a second mechanism.

New columns / keys, matching the reference Settings tab:

**Leave**
- `leaveRefPrefix`
- `leaveInstructions` (rich text, shown on the leave form)

**Payroll**
- `payrollRefPrefix`
- `payrollWordFormat`: `international | somaliland`
  *(The reference ships International/Indian — the Indian option exists because of
  lakh/crore grouping. Somaliland uses international grouping, so this option is only
  meaningful as Somali-language number words: kun / malyuun. Implementing it that way;
  say the word if you meant something else.)*
  Note: there is **no amount-in-words implementation anywhere** in the codebase today,
  so this is the renderer plus the setting.

**Attendance**
- `locationRequired` (bool) — needs lat/long capture on clock-in, which doesn't exist
- Replace the single `graceMinutes` with four:
  - `graceBeforeCheckin` — not counted as overtime
  - `graceAfterCheckin` — not counted as late *(this is what today's `graceMinutes` is)*
  - `graceBeforeCheckout` — not counted as early-leave
  - `graceAfterCheckout` — not counted as overtime
  There is no early-leave concept at all today.
- The reference notes *"Allow users to enter their own attendance has been moved to role."*
  Balanzify has a permission catalog that is **seeded, stored and editable but never
  enforced** — `req.user` never carries permissions and no route consults them. Either
  enforce the catalog or gate this with `requireRole`; do not add a settings toggle.

**Sales Targets**
- `commissionExcludesTax` (bool) — compute commission on net-of-tax sales

**Essentials**
- `todosIdPrefix`

Also make the five write-dead columns from bug 15 actually writable, and give HRM a real
**Settings tab** — today they are split across two modals hanging off other tabs.

---

## P2 — Screen parity

### 2.1 Tab restructure
Reference: `HRM | Leave Type | Leave | Attendance | Payroll | Holiday | Departments | Designations | Sales Targets | Settings`

Ours (`hrm-screen.tsx:92`): `Overview | Employees | Departments | Attendance | Report | Shifts | Leave | Payroll | Advances | Tasks`

Promote Leave Type and Settings out of modals, split Departments/Designations, add
Holiday and Sales Targets. Keep our five extras (Employees, Report, Shifts, Advances,
Tasks) — the reference has no counterpart and they are real capability.

`hrm-screen.tsx` is 925 lines / 94KB and holds the entire module. Split it into a
directory first, the way `reports.js` and `hotel.js` were split.

### 2.2 Payroll — All Payrolls
- Filters: Employee (dropdown, not substring), Business Location, Department (have it),
  Designation, Month/Year picker
- Columns: add Department, Designation, Reference No, Total amount (gross), Payment
  Status (distinct from run status), Action
- Add wizard: Location → Employee multi-select with Select all/Deselect all → Month/Year → Proceed

### 2.3 Payroll — All payroll groups
Name | Status | Payment Status | Total gross amount | Added By | Location | Created At | Action

### 2.4 Payroll — Pay Components
Description | Type | Amount | Applicable Date | Employee | Action, plus the Add modal.

### 2.5 Holiday
Filters Business Location + Date Range. Table Name | Date | Business Location | Note | Action.
Add modal: Name, Start Date, End Date, Business Location, Note.

### 2.6 Departments / Designations
Add Description, Department ID (short code), and Edit/rename. Rename is the deep one:
`Employee.department`/`designation` are denormalised `VarChar(100)` strings with no FK,
so a rename orphans every employee. Convert to FKs or cascade the rename.

### 2.7 Sales Targets
Tab listing every user with a "Set Sales Target" action; modal of repeatable
from/to/percent rows submitted as a set.

### 2.8 Leave Type
Add the **Leave count interval** radio: Current month / Current financial year / None —
and make entitlement actually count over that window. Today the cap is cumulative for the
life of the employee record (`computeBalances` sums every leave row ever filed, and all
three call sites fetch with no date predicate). `fy_start_month` already exists as a
business setting for the financial-year option.

### 2.9 Leave
Reference No column; Employee, Leave Type and Date Range filters; edit/delete a request;
required start/end dates.

### 2.10 Attendance
- Shifts sub-tab over the new `ShiftTemplate`: Name | Shift Type | Start | End | Holiday
  (weekly offs) | Action (Edit + **Assign Users**)
- All Attendance: add IP Address, Shift, Clock-in note, Clock-out note columns; Employee
  and Date Range filters; edit/delete; "Add latest attendance" back-dated create
- New sub-tabs: **Attendance by shift** (date → Shift | Present | Absent) and
  **Attendance by date** (range → Date | Present | Absent)
- New sub-tab: **Import Attendance** — upload + Submit, template download, and the
  6-column instruction table (Email, Clock in time, Clock out time, Clock in note,
  Clock out note, IP Address)

---

## P3 — Dashboard and self-service

### 3.1 Employee self-service
There is currently **no self-scoping anywhere in HRM** — no route resolves "the employee
for the logged-in user", so nobody can see their own anything. `Employee.userId` already
exists, so this is scoping work, not modelling work. Also note `GET /hrm/summary` and
`GET /hrm/employee/:id` return business-wide payroll totals and any employee's salary to
**any authenticated user** — fix with this.

Then: **My Payrolls** screen — Pay Components tab + All Payrolls tab (Month/Year,
Reference No, Total amount, Payment Status, Action).

### 3.2 Dashboard widgets
All nine are absent; the Overview tab is a 6-tile KPI strip.
My leaves · My sales targets · Birthdays (Today/Upcoming) · My Payrolls button ·
Users (Today/Upcoming) · Leaves (Today/Upcoming) · Holidays (Today/Upcoming) ·
Today's Attendance · Sales targets table.

Birthdays needs a date-of-birth field on `Employee`, which doesn't exist.

---

## Cross-cutting

- **List chrome** — every HRM table needs the shared toolbar the Reports screens already
  have (`frontend/app/(app)/reports/components/report-table.tsx`): CSV, Excel, Print,
  Column visibility, PDF, search, Show-N-entries, pagination. HRM currently has CSV +
  Print only, and no pagination anywhere.
- **Icons** — replace all 24 glyphs with `react-icons` (Lucide).
- **Tests** — the HRM module has thin integration coverage relative to its size; each
  phase should land with tests, run on the EC2 box.
