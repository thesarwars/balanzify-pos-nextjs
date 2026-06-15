# Auth Components — `Login` & `RegisterBusiness` (prompt spec)

A complete, reproducible specification of the **sign-in** and **sign-up** screens for Balanzify POS. Covers layout, color palette, typography, every component/sub-component, props, state, functions, validation, API calls, and responsive behaviour. An engineer or agent should be able to rebuild both screens pixel- and behaviour-faithfully from this file.

> Source files: `app/Screens.jsx` (the `Login` component + `Lbl`, `IconInp`, `Inp` helpers) and `app/Register.jsx` (the `RegisterBusiness` component + `RField`, `RInp`, `RSelect`, `ReviewBlock`, `primaryBtn`, `ghostBtn` helpers). Both receive the theme object `T` from `makeTheme()` (see `app/theme.jsx`).

---

## 1. Shared visual language

Both screens use a **two-pane split layout**: a dark, warm **brand banner** (left) and a light **form panel** (right). They are designed as a matched pair — identical banner treatment, same form styling.

### 1.1 Color palette
| Token (`T.*`) | Value | Used for |
|---|---|---|
| accent.base | `#A16207` (brass) | logo gradient, glows, links, step badge, focus ring |
| accent.bright | `#C8881A` | logo gradient top, headline accent word, badge dot, feature icons |
| accent.soft | `#F4EAD6` | focus-ring halo, info pills, demo note bg |
| accent.text | `#7A4A06` | link text, "Step X of N", "Forgot?", error-field labels |
| accent.on | `#FFFFFF` | text on brass |
| paper | `#FFFDF9` | input background, register outline button |
| paperAlt | `#F6F3EE` | **form-panel background** |
| ink | `#1A1611` | primary text / headings |
| inkSub | `#7A7264` | secondary text, labels |
| inkMute | `#A89F8E` | placeholder icons, password toggle |
| line | `#EAE3D6` | input borders, dividers |
| lineMid | `#D9CFBC` | dot separators |
| green / greenSoft | `#0E9F6E` / success | register "all set" check |
| red / redSoft / redText | `#DC2626` / `#FBE3E1` / `#961717` | error banners |

**Brand banner ground (NOT navy/blue):** warm **espresso** radial gradient
`radial-gradient(120% 90% at 18–20% 30–32%, #4A3320 0%, #2A1D11 50%, #140D06 100%)`.

**Banner glow & texture layers** (stacked, absolutely positioned, `z-index` below content):
- Brass glow top-right: `radial-gradient(circle, {accent.base}40 0%, transparent 68%)`, `blur(10px)`.
- Soft brass glow bottom-left/right: `{accent.base}22 → transparent`, `blur(12px)`.
- Faint grid texture: two 1px white `linear-gradient`s at `44px` tile, `opacity .45`, masked by `radial-gradient(circle at ~28% ~38%, #000, transparent 78%)`.
- (Register only) oversized faint **"B" monogram** bottom-right: `fontSize 460`, `color rgba(255,255,255,0.025)`, fills negative space.
- Top sheen (Register): `linear-gradient(180deg, rgba(255,255,255,0.05), transparent)`, height 160.

### 1.2 Typography
- Display (`T.fDisplay` = Fraunces serif): headlines, section titles, big numbers — weight `T.dispWeight` (600), letter-spacing `-0.6 … -1.2px`.
- Body (`T.fBody` = DM Sans): labels, paragraphs, buttons.
- Mono (`T.fMono` = DM Mono): stats, username echo, password dots.
- Headline accent: final word colored `T.accent.bright` (e.g. "counter.", "minutes.").

### 1.3 Shape & motion
- Radius: inputs/buttons `T.r` (10). Pills `999`. Logo `12–13`.
- Focus: border → `T.accent.base` + `box-shadow 0 0 0 3px {accent.soft}` (IconInp); plain border swap (Inp/RInp).
- Spinner: 15px ring, `border-top: #fff`, `animation: spin .7s linear infinite`.
- Buttons press: `transform: scale(0.99)` on mousedown (login submit).

### 1.4 Responsive
Both: `<style>@media (max-width: 860px){ .login-brand / .reg-brand { display:none !important } }</style>`. Login additionally reveals a compact mobile logo (`.login-mini-logo { display:flex !important }`). Form panel: Login `width 480` (`min(480px,100%)`), Register `width 520` (`min(520px,100%)`).

---

## 2. `Login` component (`app/Screens.jsx`)

### Signature
`function Login({ T, onLogin, onRegister, prefillUser })`
- `onLogin()` — called after a successful `auth.login`.
- `onRegister()` — switch to the Register screen.
- `prefillUser` — username string to pre-fill (after coming back from registration).

### State (`useStateM` = React.useState)
| State | Init | Purpose |
|---|---|---|
| `show` | `false` | password visibility toggle |
| `email` | `prefillUser || 'amina@hodanmarket.so'` | email field |
| `pw` | `prefillUser ? '' : 'demo1234'` | password field |
| `busy` | `false` | submit in-flight |
| `err` | `null` | error message |

### Functions
- `submit(e)` — `preventDefault`; set busy; `await API.auth.login(email, pw)` → `onLogin()`; on throw set `err` to `ex.message || 'Sign in failed. Check your credentials.'`; always clear busy.

### Layout
**Left brand banner** (`flex 1.15`, espresso ground + glow/grid/sheen layers):
1. Logo row — 44px brass-gradient rounded square "B" (`boxShadow 0 6px 20px {accent.base}66`) + "Balanzify" 20px/700.
2. Pill badge — `● Built for East-African retail` (translucent white bg, brass glowing dot).
3. Headline — Fraunces 40px, `-1.2px`: "Run your shop from / one calm **counter.**" (accent word brass).
4. Sub-paragraph — 14.5px, `rgba(255,255,255,0.52)`: POS/inventory/pharmacy/hotel/HR/credit pitch across Somaliland·Somalia·Kenya·Ethiopia.
5. Feature list (3) — icon tile (36px, translucent) + title + subtitle:
   - `◈ Zaad, EVC Plus & M-Pesa` — "Mobile money built into every sale"
   - `◫ Works offline` — "Keep selling, syncs when you reconnect"
   - `✦ AI insights` — "In Somali, Arabic & English"
6. Trust stats row — `2,400+ shops`, `12M+ sales rung`, `4 countries and growing` (mono numbers).

**Right form panel** (`paperAlt`, max 372):
- (Mobile only) mini logo.
- Heading "Welcome back" (Fraunces 30px) + "Sign in to {BUSINESS.name}".
- `<form onSubmit={submit}>`:
  - `Lbl "Email address"` + `IconInp icon="✉" type=email placeholder="you@business.com"`.
  - Row: `Lbl "Password"` + "Forgot?" link (right, accent).
  - `IconInp icon="⚿" type={show?text:password}` with `trailing` = show/hide toggle button (`●`/`◯`).
  - Error banner (if `err`): red soft pill with `⚠`.
  - Submit button — full-width, navy-gradient (`linear-gradient(135deg, navyLight, navy)`), shadow; shows spinner + "Authorizing…" while busy, else "Sign in →". *(Note: button keeps the navy gradient; only the banner ground is espresso.)*
- Divider "New to Balanzify?".
- **Register** outline button (`T.paper`, `1.5px line`, hover border→accent) → `onRegister()`.
- Demo note (accent.soft pill): credentials pre-filled.

### Helpers
- `Lbl({T, children})` — 12px/600 inkSub label, `marginBottom 6`.
- `IconInp({T, icon, trailing, ...})` — input with a left icon (absolute, 13px from left, inkMute) and optional right `trailing` node; `padding 12px 14px 12px 38px`; focus → accent border + `0 0 0 3px {accent.soft}` ring.
- `Inp({T, ...})` — plain bordered input (legacy; focus swaps border color only).

---

## 3. `RegisterBusiness` component (`app/Register.jsx`)

### Signature
`function RegisterBusiness({ T, onRegistered, onBackToLogin })`
- `onRegistered(username)` — go to Login prefilled with the new username.
- `onBackToLogin()` — return to Login.

### Constants
`REG_STEPS = [['Business','Name, currency & time zone'], ['Tax','GST / VAT — optional'], ['Admin user','Your login credentials'], ['Review','Confirm & register']]`.

### State
| State | Init | Purpose |
|---|---|---|
| `step` | `0` | current wizard step (0–3) |
| `busy` | `false` | submit in-flight |
| `err` / `errField` | `null` | error message / offending field key |
| `done` | `null` | success payload `{message, username, role}` |
| `currencies` / `timezones` | `[]` | reference data from API |
| `showPw` | `false` | password visibility |
| `biz` | `{name:'', start_date: today, currency_id: 1, time_zone: ''}` | step 0 |
| `tax` | `{tax_label_1:'VAT', tax_number_1:'', tax_label_2:'', tax_number_2:''}` | step 1 |
| `user` | `{name:'', email:'', username:'', password:''}` | step 2 |

### Effects & API
- On mount: `API.business.currencies()` → `setCurrencies`; `API.business.timezones()` → `setTimezones` + default `biz.time_zone` to first.
- `submit()` → `API.business.register({ business: biz, tax, user })`. Success → `setDone(res)`. Error → `setErr(ex.message)`, `setErrField(ex.body?.field)`, and **jump to the step owning the bad field** (`name`→0; `user_name/email/username/password`→2).

### Functions
- `sB/sT/sU(key,val)` — update biz/tax/user; clear matching field error.
- `clearErr(field)` — clear err if it matches `errField`.
- `canAdvance()` — step 0 requires `biz.name`; step 2 requires name+email+username+password(≥6); else true.

### Validation (server-side, mirrored in client gate)
Business name required; valid email; **reject disposable-email domains**; username ≥4 chars & unique; password ≥6.

### Layout
**Left brand banner** (espresso ground + glows + grid + monogram + sheen, same as Login):
- Logo row, pill badge `● Free to start · no card needed`, headline "Set up your business / in a few **minutes.**", sub-paragraph, then a **vertical step indicator**:
  - Each step: 30px circle — `active`=brass bg + `0 0 0 4px {accent.base}33` ring; `done`=translucent white + `✓`; `todo`=outlined, 0.42 opacity — plus label + sub.

**Right form panel** (`paperAlt`, max 400):
- If `done`: success state — 70px green check, "You're all set", `done.message`, "Signed up as **{username}** · {role}", `Go to sign in →` (primaryBtn).
- Else: "Step {n} of 4" (accent), step title (Fraunces 27px) + subtitle, then the step body:
  - **Step 0 Business** — `RField`s: Business name (required), Start date (date), Currency + Time zone (selects, side by side).
  - **Step 1 Tax** — info pill; Tax 1 name/number + Tax 2 name/number (two rows, optional).
  - **Step 2 Admin user** — Your name, Email, Username (`hint: "Used to sign in — can't be changed later."`, strips spaces), Password (`hint: "At least 6 characters."`) with show/hide toggle.
  - **Step 3 Review** — three `ReviewBlock`s (Business / Tax / Admin user) each with an **Edit** link that jumps back to that step; password shown as dots.
  - Error banner (red soft + `⚠`) when `err`.
  - **Nav row**: `Back` (ghostBtn, steps>0) + either `Continue` (primaryBtn, disabled unless `canAdvance()`) or, on step 3, `Register business` (primaryBtn, spinner + "Registering…" while busy).
  - Footer: "Already have an account? **Sign in**" → `onBackToLogin()`.

### Helpers
- `RField({T, label, required, hint, error, children, style})` — label (red when `error`), optional `*`, optional hint.
- `RInp({T, error, ...})` — bordered input; focus → accent border.
- `RSelect({T, children, ...})` — styled native select.
- `ReviewBlock({T, title, rows, onEdit})` — bordered card; header with title + Edit link; key/value rows.
- `primaryBtn(T)` — full-width navy-gradient button style object.
- `ghostBtn(T)` — outline button style object.

---

## 4. API surface used
| Call | Endpoint (contract) | Used by |
|---|---|---|
| `API.auth.login(email, pw)` | `POST /oauth/token` | Login submit |
| `API.business.currencies()` | `GET /business/currencies` | Register mount |
| `API.business.timezones()` | `GET /business/timezones` | Register mount |
| `API.business.register({business,tax,user})` | `POST /business/register` | Register submit |

Errors surface as `ApiError(status, message, body)`; `body.field` drives field-level highlighting on Register.

---

## 5. Rebuild checklist
- [ ] Espresso banner gradient + brass glows + masked grid (+ monogram/sheen on Register).
- [ ] Pill badge, accent-word headline, feature list / step indicator.
- [ ] `IconInp` with left icon + focus ring; password show/hide.
- [ ] Login: email+password, demo note, register outline button, navy-gradient submit with spinner.
- [ ] Register: 4-step wizard, reference-data load, per-field validation + step jump, review with edit, success state.
- [ ] Responsive: hide banner <860px; Login mobile logo.
- [ ] Theme: every value from `T.*` (never hard-code except the espresso `#4A3320/#2A1D11/#140D06` ground and white-alpha texture layers).
