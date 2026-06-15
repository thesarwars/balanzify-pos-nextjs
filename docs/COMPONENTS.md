# Balanzify POS — Component Stories (deep reference)

> For every component: **what it is**, **props in**, **internal state**, **functions it owns**, **API calls**, **sub-components / modals / windows it renders**, and **key behaviours**. An engineer or agent should be able to rebuild or safely modify any component from its entry here.

Conventions used below:
- **Props in** — what the parent passes. `T` (theme tokens) is passed to virtually everything; omitted from each list unless notable.
- **State** — `useState` the component owns.
- **Calls** — `API.<group>.<method>()` invoked.
- **Renders** — child components, modals, and print windows.

---

## 0. Cross-cutting contracts

- **`T` (theme):** the object from `makeTheme()` — colors (`T.accent.*`, `T.ink`, `T.paper`, `T.green/amber/red/blue/violet`, `T.line`), radii (`T.r/rLg/rXl`), shadows (`T.sh1/2/3/shModal`), fonts (`T.fDisplay/fBody/fMono`). Every visual value reads from `T`.
- **`API`:** `window.API` — each group is `{ async method() }` calling `transport()`. Components never `fetch` directly.
- **Toasts:** `const [show, node] = useToast()` — call `show('msg')`, render `{node}`.
- **Responsive:** `const { isMobile } = useViewport()` toggles drawer/sheet/stacked layouts.
- **Modal pattern:** `<Modal T title subtitle width onClose footer={...|null} onSave saveLabel>children</Modal>`. A `null` footer means the body provides its own actions.

---

## 1. `theme.jsx` — design system source
- **Exports:** `makeTheme({accent,type,sidebar})`, `ACCENTS`, `TYPE_PRESETS`, `SIDEBARS`, `money`, `money0`, `moneyParts`, `timeAgo`.
- **Story:** Pure functions, no React. `makeTheme` composes an accent preset + type preset + sidebar token set into one flat `T` object consumed app-wide. `sideTokens(base,a)` builds light/dark sidebar palettes so text/borders/active states flip correctly. `money()` formats East-African currency (2dp grouped).

## 2. `data.jsx` / `data2.jsx` — seed & config
- **`data.jsx`:** `BUSINESS, CATEGORIES, PRODUCTS, CONTACTS, DASH, …` — the mock catalog/contacts/dashboard seed. Top-level consts shared via global lexical scope.
- **`data2.jsx`:** `STOCK_ROWS` (derived from PRODUCTS, **guarded** `typeof PRODUCTS !== 'undefined'` against the Babel load race), `STOCKTAKE`, and `SCREENS` config tables driving generic data screens. Eager `PRODUCTS.length` refs are guarded.

## 3. `api.jsx` — the backend in a file
- **Story:** Declares all mock data, a `route(method,path,handler)` table, `transport(method,path,{query,body,auth})` (mock↔live + Bearer), adapters (`adaptProduct`), and `window.API` (grouped async methods). At boot, `replayLedger()` (try/caught) restores stock + sales from the `localStorage` ledger so a refresh reproduces state.
- **Key internal fns:** `route`, `transport`, `ApiError`, `adaptProduct`, `deductStock`, `syncCategoryCounts`, `serialize*` (Register, Transfer, PO/SO, Discount, Expense, Advance, Shift, Swap, Biz), `attendanceSummary`, `leaveBalance`, `buildPayslip`, `employeeProfile`, `moduleOn`, `outstandingAdvance`, `clockStatus`, `decorateAtt`.
- **Groups on `API`:** auth, business, product, unit, brand, variation, taxRate, sell, sellReturn, contact, customerGroup, user, role, permissions, location, invoiceScheme, invoiceLayout, priceGroup, paymentMethod, purchase, openingStock, transfer, purchaseOrder, salesOrder, discount, reward, expense, paymentAccount, stockAdjustment, register, heldSale, serviceType, module, report, restaurant, hrm, superadmin, config.

## 4. `kit.jsx` — primitives (the vocabulary)
| Component | Props in | Renders / behaviour |
|---|---|---|
| `Btn` | `kind, onClick, disabled, style, children` | brass/navy/ghost/danger variants |
| `Badge` | `tone, children` | status pill |
| `Trend` | `value` | ▲/▼ delta |
| `StatCard`/`MiniStat` | `label, value, tone` | KPI tile |
| `Panel` | `title, subtitle, pad, right, children` | card; `pad={false}` → flush table |
| `Modal` | `title, subtitle, width, onClose, footer, onSave, saveLabel, children` | overlay + `sheetUp` anim; `min(width,96vw)` |
| `Field` | `label, hint, required, error, full` | form-field wrapper |
| `TextField` | `value, onChange, type, placeholder, style` | controlled input |
| `SelectField` | `value, options, onChange, render` | styled select |
| `FormGrid` | `cols, children` | responsive auto-fit grid |
| `useToast` | — | `[show, node]` |
| `useViewport` | — | `{w,isMobile,isTablet}` |
| helpers | `methodTone`, `swatchBg` | payment colour, product swatch gradient |

## 5. `Shell.jsx` — chrome
- **`Sidebar({T,screen,setScreen,collapsed,setCollapsed,onLogout,mobile})`** — sectioned nav array; renders nav items with active rail; collapsible desktop / off-canvas drawer mobile; exposes `window.__bzOpenDrawer`.
- **`Topbar({T,title,subtitle,right})`** — title + hamburger (mobile) + `right` action slot.
- **`Login`** (also in Screens) — brand split + form.

## 6. `App.jsx` — router & mount
- **State:** `authed, authView ('login'|'register'), prefillUser, screen, collapsed, drawerOpen`; `const T = makeTheme(tweaks…)`.
- **Story:** Reads tweaks → builds `T`; if `!authed` shows Login/Register; else renders `<Sidebar>` + the screen matching `screen` via a big switch (`screen==='pos' → <POS T/>`, etc.); mounts `<ApiPanel>`. **Mount poll** waits for `useTweaks/makeTheme/BUSINESS/API/Sidebar` before `createRoot().render` (guards Babel async-load race).

---

## 7. `POS.jsx` — the till (most complex)
- **Props in:** `T`, `tweaks` (tillDark, posGrid, posCart).
- **State:** `q` (search), `cart [{key,id,varName,qty}]`, `held`, `parked[]`, `parkedOpen`, `customer`, `custOpen`, `contacts`, `custGroups`, `reward`, `posting`, `invoice`, `charged`, `postErr`, `payOpen`, `payMode ('quick'|'split')`, `tenders[]`, `changeDue`, `sheetOpen`, `varPick`, `redeem`, `register`, `regModal ('open'|'details'|'close')`, `priceGroups`, `priceGroupId`, `serviceTypes`, `serviceTypeId`.
- **Derived:** `priceOf(p,varName)` (group/price-group adjusted), `stockOf`, `lines` (cart→line view-models), `subtotal/tax/discount/packing/total`, `avail = p.stock − inCartQty` (live reservation).
- **Functions:** `add(p,varName)` (variation picker if needed), `inc/dec/removeLine`, `clear`, `openPay`, `finalize(payments,label)` (POSTs sell; computes change/credit), `charge`, `expressCheckout`, `creditSale`, `park(type)`, `resume(h)`, `removeParked`, `pickCustomer`, `refreshRegister/refreshParked`, `doOpen/doClose` (register).
- **Effects:** load contacts/groups/reward/register/priceGroups/parked/serviceTypes; **`beforeunload` guard** when `cart.length`; 30s tick for running register.
- **Calls:** `contact.list, customerGroup.list, reward.getSettings, register.current/open/close/shifts, priceGroup.list, heldSale.list/save/remove, serviceType.list, sell.create`.
- **Renders:** `Tile` (card) & `ProductRow` (list) — both show **available stock** badge + cart-qty; Order/cart panel (rail/sheet/panel); **Payment modal** (quick grid / split tenders + change/credit, express cash); **Variation picker**; **Customer picker**; **Parked orders** modal; **RegisterModal** (open/details/close+reconcile). Top bar: register status pill, price-group select, service-type select.

## 8. `Products.jsx` — catalog
- **State:** `q, cat, lowOnly, products, loading, sel (detail), editing (form), refs {units,brands,variations,taxRates,priceGroups}, confirmDel, unitMgr, varMgr, pgMgr, impExp, labels`. `form` holds the full editor model (type, name, sku, cat, unit, brand, tax, alert_quantity, enable_stock, not_for_selling, price, cost, stock, variations[], combo[], swatch, img).
- **Functions:** `reload, loadRefs, openNew, openEdit(p), duplicate(p), doDelete, applyTemplate, setVarRow, fillDown, addCombo, validate, save`.
- **Calls:** `product.list/create/update/remove, unit.list, brand.list, variation.list, taxRate.list, priceGroup.list`.
- **Renders:** filterable table (Product/SKU/Category/Price/Margin/**Stock badge**); **detail drawer** (full-screen mobile) with Edit/Duplicate/Delete + variation & stock breakdown; **Add/Edit Product modal** (single/variable/combo, variations grid w/ fill-down, combo builder); managers **UnitManager, VariationManager, PriceGroupManager**; **ImportExport**, **PrintLabels**; delete confirm.

## 9. `Labels.jsx` — `PrintLabels`
- **Props in:** `initial[]`, `onClose`. **State:** `items[{id,qty}], q, opts{business,name,price,sku}, perRow`.
- **Story:** search→add products, set qty, toggle fields, live barcode preview (`barsFor` deterministic pattern), **print window** (`doPrint`).

## 10. `ImportExport.jsx`
- **State:** `tab('export'|'import'), refs, raw (csv text), parsed {rows,valid,error}, importing, result`.
- **Functions:** `doExport, downloadTemplate, onFile, validate(text)` (maps headers, validates unit/category/number per row), `runImport` (POSTs each valid row).
- **Calls:** `brand.list, unit.list, product.create`.

## 11. `Screens.jsx` — Login, Sales, Sell-return
- **`Login({T,onLogin,onRegister,prefillUser})`** — email/pw, show/hide, busy/err; calls `auth.login`.
- **`Sales`** — sales history table; opens **SellReturnModal**.
- **`SellReturnModal`** — loads a sale's lines (`sell.get`), select qty per line, `sellReturn` (restock + points reversal).

## 12. `Register.jsx` — `RegisterBusiness`
- **Props in:** `onRegistered(username)`, `onBackToLogin`. **State:** `step(0–3), busy, err, errField, done, currencies, timezones, showPw, biz, tax, user`.
- **Functions:** `canAdvance, submit` (validates → `business.register`). **Renders:** vertical step rail + per-step forms (Business/Tax/Admin/Review) + success screen.

## 13. `Contacts.jsx`
- **State:** `kind('customer'|'supplier'), rows, sel (drawer), editing, groups, payFor, groupMgr`.
- **Calls:** `contact.list/get/create/update/remove/ledger, contactPayment, customerGroup.list/create/remove`.
- **Renders:** table; **ContactDrawer** (full-screen mobile) with ledger + Edit/Pay/Delete; **Add/Edit Contact** modal; **Payment** modal; **Customer Groups** manager.

## 14. `UsersRoles.jsx`
- **State:** `tab('users'|'roles'), users, roles, perms, locs, editUser, editRole`.
- **Calls:** `user.*, role.*, permissions.list, location.list`.
- **Renders:** Users table + **User modal** (role, location access, max discount, commission %); Roles cards + **Role modal** (grouped permission matrix).

## 15. `Locations.jsx`
- **State:** `rows, sel, editing, refs {schemes,layouts,priceGroups,methods}`.
- **Calls:** `location.list/get/create/update, location.setStatus, invoiceScheme.list, invoiceLayout.list, priceGroup.list, paymentMethod.list`.
- **Renders:** location cards + **editor modal** (scheme/layout/price-group/payment methods/status). Status toggle guarded "keep one active".

## 16. `Purchases.jsx`
- **State:** `rows, sel, editor, suppliers, locs`. **Calls:** `purchase.list/get/create, openingStock.create, contact.list(supplier), location.list`.
- **Renders:** purchase table + **editor** (supplier/location/lines, paid→payment_status) + **opening-stock** action.

## 17. `Transfers.jsx`
- **State:** `rows, loading, locs, edit, view, confirmDel`. **Calls:** `transfer.list/get/create/setStatus/remove, location.list`.
- **Renders:** transfer table (From→To, status); **TransferEditor**, **TransferView**; status flow Ship→Complete (completed locks); delete confirm.

## 18. `Orders.jsx`
- **State:** `tab('purchase'|'sales'), poRows, soRows, parties {suppliers,customers}, locs, edit, view`.
- **Functions:** `convert(o)` (PO→`purchase.create`, SO→`sell.create`), `del`.
- **Renders:** tabbed tables (status ordered/partial/completed); **OrderEditor**, **OrderView**; Receive/Convert actions.

## 19. `Discounts.jsx`
- **State:** `rows, loading, refs {brands,locs}, edit, confirmDel`. **Calls:** `discount.list/create/update/remove, brand.list, location.list`.
- **Renders:** discount table (scope badges, value, priority, period, status) + **DiscountEditor** (brand/category/location, priority, fixed/%, dates, price-group/customer-group flags, active) + **DcToggle**.

## 20. `InvoiceLayouts.jsx`
- **State:** `rows, sel, adding, name`. **Calls:** `invoiceLayout.list/create/update/remove`.
- **Renders:** layout list + editor (design, header/footer, toggles) + **ReceiptPreview** (live, classic/elegant/slim) with `amountInWords`; print window.

## 21. `Finance.jsx`
- **Props in:** `tab('expenses'|'accounts')`. **State:** `expenses, cats, accounts, types, locs, modal`.
- **Calls:** `expense.list/categories/addCategory/create/remove, paymentAccount.list/types/create/remove/transfer/deposit, location.list`.
- **Renders:** Expenses table + **ExpenseModal** (category adder, account draw-down, refund); Account cards (bank=navy) + **AccountModal**, **TransferModal**, **DepositModal**.

## 22. `Adjustments.jsx`
- **State:** `rows, loading, locs, edit, taxMgr, confirmDel`. **Calls:** `stockAdjustment.list/create/remove, location.list, taxRate.list/groups/createGroup/removeGroup`.
- **Renders:** adjustment table + **AdjustmentEditor** (normal/abnormal, reason, lines→reduce stock) + **TaxGroupManager** (combine rates).

## 23. `DataScreen.jsx` — generic + Reports/Settings/Modules
- **`DataScreen`** renders a `SCREENS[id]` config (title, stats, columns, form) generically.
- **`Reports`** — tabs Overview / **CommissionReport** / **RegisterReport** (`report.*`, `register.*`).
- **`Settings`** — business/tax/payment toggles (local).
- **`Modules`** — `module.list/setEnabled`; add-on cards with price + **live plan total**; toggles gate features. **PackageModal** lives here in spirit (Superadmin owns billing).

## 24. `Restaurant.jsx` (add-on, gated)
- **State:** `enabled (null|bool), tab, tables, staff, modifiers, kitchen, locs, modal`.
- **Calls:** `module.list/setEnabled, restaurant.tables/addTable/setTable/removeTable/staff/addStaff/removeStaff/modifiers/addModifier/removeModifier/kitchen/setKitchen, location.list`.
- **Renders:** locked state → "Enable $19/mo"; tabs Tables (free/occupied), Service Staff (PIN), Modifiers (sets+options), Kitchen (KOT ready→served); **RsAdd**, **ModifierAdd** modals.

## 25. `HRM.jsx` (add-on, gated — largest screen)
- **State:** `enabled, tab, summary, emps, att, leaves, pay, todos, leaveBal, leaveTypes, shifts, advances, swaps, profile, nowClock, report, reportMonth, org, meta, locs, modal, q, fDept, fStatus`.
- **Derived filters:** `fAtt, fLeaves, fShifts, fPay, fAdvances, fTodos, fReport` (search + department + status). `exportSets` per tab → `exportCSV()` / `printTable()`.
- **Calls (`API.hrm.*`):** summary, employees, employee(profile), org, attendance, clock, breakToggle, autoAbsent, settings/saveSettings/setEmpShift, leaves, addLeave, setLeave (records `approved_by`), leaveBalances/empLeaveBalance, leaveTypes/addLeaveType/updateLeaveType/removeLeaveType, leaveOverride/setLeaveOverride, payroll, addPayroll, payslip, payslipSettings/savePayslipSettings, shifts/addShift/removeShift, shiftSwaps/addSwap/setSwap/removeSwap, advances/addAdvance/removeAdvance/outstandingAdvance, attendanceSummary/empSummary, todos/addTodo/setTodo, addOrg/removeOrg.
- **Tabs & their components:** Overview (stat cards); **Employees** (table row → **EmployeeProfile** drawer: avatar, cashier link, sales/commission, payroll+**payslip print**, attendance, leave, advances); **Departments** (dept/designation managers + **OrgAdder/OrgModal**); **Attendance** (clock-in/out/break status cards, grace, flexible badge, **running** live hours, table; **AttendanceSettings** modal); **Report** (monthly summary + **Mark absentees**); **Shifts** (roster + swap-requests table + **ShiftModal**, **SwapModal**); **Leave** (dynamic **balances matrix**, table with **Approved by**; **LeaveModal** w/ live balance, **LeaveTypesManager** w/ per-employee override); **Payroll** (overtime/bonus/incentive/deductions auto-prefill, **PayrollModal**, **PayslipSettings**); **Advances** (**AdvanceModal**, account draw-down + payroll recovery); **Tasks** (**TodoModal**). **Every data tab:** search + dept + status filter bar (`hrFilterSel`) and **Export/Print** buttons.
- **Helpers:** `hrInitials, hrAvatar (deterministic colour), hrMini, hrFilterSel`.

## 26. `Superadmin.jsx` (add-on, gated)
- **State:** `enabled, tab, stats, biz, pkgs, pays, gw, addPkg`.
- **Calls:** `module.list/setEnabled, superadmin.stats/businesses/setBusiness/packages/addPackage/removePackage/payments/setPayment/gateways/setGateways`.
- **Renders:** locked state; MRR dashboard; tabs Businesses (activate/deactivate/login-as), Packages (cards + **PackageModal**), Payments (approve offline), Gateways (Offline/Stripe toggles).

## 27. `ApiPanel.jsx`
- **State:** `open, mode, baseUrl, log`. Floating **Mock⇄Live** toggle, base-URL field, **request log** (method/path/status/latency). Calls `config.*`. Branded "Balanzify POS".

## 28. `Verticals.jsx`
- Vertical-specific screen variants (e.g., pharmacy Rx flags) composed from the same primitives + `PRODUCTS`/screen configs.

---

## Data-flow summary (how an agent traces any feature)
1. Find the **screen file** (table above) → identify its **state** and **`API.<group>` calls**.
2. Open `api.jsx`, find the matching **`route()`** handlers → see request/response shape & side-effects (stock, ledger, balances).
3. Cross-reference **`SCHEMA.md`** for the entity, **`API_CONTRACT.md`** for the wire format.
4. Modals/managers are **child functions in the same screen file**, taking `{T, …data, onClose, onSaved}` and calling the same `API` group. Edit the child, not the table, for form changes.
