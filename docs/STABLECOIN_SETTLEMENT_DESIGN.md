# Stablecoin Settlement Rail — Engineering Spec (USDC treasury + multi-currency GL)

> **Status:** design. This is the first concrete engineering lift for making a USD
> stablecoin the cross-border **settlement** rail. It does NOT make merchants or
> customers transact in crypto — local money / mobile money stays the user-facing
> layer. USDC is the invisible USD backbone behind diaspora remittance, the
> merchant wallet, and inter-merchant settlement.

## 0. Principles (the non-negotiables)

1. **Off-chain ledger, on-chain only at the edges.** Retail transactions are
   ledger entries; the blockchain is touched only when value crosses the platform
   boundary (a real off-ramp/treasury move). Net and batch.
2. **1:1 reserves, always.** Every unit of customer USDC balance is backed by a
   real USDC unit in segregated treasury. Never fractional, never lent (lending
   the float is a separate, separately-licensed activity).
3. **Custodial + abstracted.** Users never hold keys. Custody is a partner
   (Fireblocks / Bridge / Brale). The platform is VASP/MSB **via a partner of
   record**, not as principal, at launch.
4. **Riba-free reserves.** USD reserves must not earn interest that accrues to the
   platform or users — hold non-interest, or route any unavoidable yield to
   charity (mirrors the existing `2300 Charity Payable` pattern). Gated on the
   Sharia board's ruling.

## 1. Two ledgers, one boundary

The system already has a **per-business GL** (`accounts` keyed by `[businessId, code]`,
`postJournal` asserts balanced, single-currency, `Decimal(14,2)`). That stays.

We add a **Platform Treasury Ledger** — a *new book owned by the platform tenant*
(not a merchant) whose **base currency is USDC**. It records the reserve, customer
wallet liabilities, on/off-ramp clearing, FX, and fees.

```
            ON-RAMP                TREASURY LEDGER (USDC base)             OFF-RAMP
 diaspora ──fiat──▶ [partner] ──USDC──▶  ┌───────────────────────────┐  ──USDC──▶ [LP] ──Zaad──▶ recipient
                                          │ 1900 USDC Treasury (asset)│
 merchant wallet balance  ◀──────────────│ 2600 Customer Wallet Pybl │
 (shown in local ccy)                    │ 1905 On/Off-ramp Clearing │
                                          │ 4900 FX Gain/Loss · 4910 Fee Income │
                                          └───────────────────────────┘
                INVARIANT:  Σ(2600 Customer Wallet Payable) == 1900 USDC Treasury == on-chain balance
```

The merchant's **own** business GL is unchanged: their wallet balance is, to them,
an asset (`1025 Merchant Wallet`, already exists) — money the platform holds for
them. To the platform it's a **liability** (`2600`). Same money, two perspectives.

## 2. Multi-currency: the minimum viable change to the GL

The existing `postJournal` is single-currency. Rather than rewrite it, **extend the
line, keep balance in the book's base currency:**

`JournalLine` gains:
- `currency VARCHAR(3)` (default the book's base — `USD` for merchant books today)
- `fxRate Decimal(18,8)` (rate to the book base at posting time; default 1)
- `amountCcy Decimal(18,2)` (the original-currency amount; `debit/credit` stay as
  the **base-currency** translated amount, so the existing balance assertion and
  every existing report keep working unchanged)

So a USDC line in the treasury book posts `debit/credit` in USDC (base = USDC,
rate 1). A future ETB line in a merchant book posts `amountCcy` in ETB and
`debit/credit` as the USD translation. **Existing single-currency postings are
untouched** (`currency=base, fxRate=1, amountCcy=debit−credit`).

New supporting tables:
- `fx_rates(base, quote, rate, as_of)` — USDC↔local rates (sourced from the LP / an
  oracle); used for display and off-ramp.
- `reserve_snapshots(as_of, onchain_usdc, ledger_liability, delta)` — the periodic
  proof of 1:1.

## 3. New chart accounts (platform treasury book)

| Code | Name | Type | Purpose |
|------|------|------|---------|
| 1900 | USDC Treasury | asset | on-chain reserve held in custody |
| 1905 | On/Off-ramp Clearing | asset | in-flight ramp transfers (the async settlement pattern we already use for M-Pesa) |
| 2600 | Customer Wallet Payable | liability | what the platform owes users (sum across all wallets) |
| 2300 | Charity Payable | liability | *(exists)* — destination for any reserve yield |
| 4900 | FX Gain/Loss | revenue | translation differences on local-ccy wallets |
| 4910 | Settlement Fee Income | revenue | the platform's remittance/off-ramp margin |

## 4. Money flows → exact postings

**A. On-ramp** (diaspora sends $100; partner mints 100 USDC to treasury; credited to recipient R):
```
On partner confirmation (async, via the ramp clearing account — same pattern as the M-Pesa STK reconciliation):
  Dr 1905 On/Off-ramp Clearing   100 USDC
  Cr 2600 Customer Wallet Payable[R] 100 USDC      ← R's balance appears
On-chain receipt confirmed:
  Dr 1900 USDC Treasury          100 USDC
  Cr 1905 On/Off-ramp Clearing   100 USDC          ← reserve now backs the liability 1:1
```

**B. Internal transfer / spend** (R pays merchant M for goods, 30 USDC) — *no chain, no off-ramp*:
```
Platform book:  Dr 2600 Wallet Payable[R] 30 / Cr 2600 Wallet Payable[M] 30
Merchant M's own book (unchanged sale flow):  Dr 1025 Merchant Wallet 30 / Cr 4000 Revenue 30 (+COGS)
```
Value never left the system — the ideal case (closes the loop, zero ramp cost).

**C. Off-ramp to mobile money** (R withdraws 50 to Zaad; LP fronts the Zaad, platform sends USDC to LP; 1.5% fee):
```
  Dr 2600 Wallet Payable[R]      50.00 USDC
  Cr 1900 USDC Treasury          49.25 USDC   (sent to LP)
  Cr 4910 Settlement Fee Income   0.75 USDC
On-chain USDC→LP settles: reduces 1900 to match. Recipient's Zaad credited by the LP off-platform.
```
Local-currency display of R's balance uses `fx_rates`; any rate drift between
credit and debit books to `4900 FX Gain/Loss`.

**D. Merchant-agent cash-out** (R cashes out 20 at merchant M, who pays physical cash and earns a fee):
```
  Dr 2600 Wallet Payable[R] 20.00 USDC
  Cr 2600 Wallet Payable[M] 19.50 USDC   (M's balance rises by what they'll reclaim)
  Cr 4910 Fee Income         0.50 USDC
```
No chain, no LP — **the merchant network IS the off-ramp.** This is the differentiator.

## 5. Reserve integrity + reconciliation

The cardinal invariant, checked continuously and snapshotted:
```
Σ(2600 Customer Wallet Payable)  ==  balance(1900 USDC Treasury)  ==  on-chain custody balance
```
A reconciliation job (cron) pulls the custody/on-chain balance, compares to the
ledger liability, writes a `reserve_snapshots` row, and **alerts on any non-zero
delta**. A breach freezes withdrawals. This is the trust spine — it must never be
fractional.

## 6. Sharia structure

- Reserves held as **non-interest-bearing** USDC (or fiat in a non-interest
  account). If the custody/reserve unavoidably earns yield, it is **not** recognized
  as platform or user income — route it to `2300 Charity Payable` (the riba-free
  pattern already built for lending late-fees).
- USDC is used **purely as a transfer medium**, never as a speculative or
  yield product. Gated on the board's written ruling (the parallel research pass
  covers the scholarly position).

## 7. Data model additions (summary)

```
JournalLine            + currency, fxRate, amountCcy           (additive; existing rows default to base/1)
fx_rates               base, quote, rate, as_of
reserve_snapshots      as_of, onchain_usdc, ledger_liability, delta
stablecoin_wallets     ownerType(user|merchant|platform), ownerId, balanceUsdc, displayCurrency
stablecoin_txns        walletId, type(onramp|transfer|spend|offramp|cashout|fee), amountUsdc, fxRate, ref, status
onchain_settlements    direction(in|out), txHash, amountUsdc, partner, status   (the edge events)
ramp_partners          key, kind(onramp|offramp|custody), config                (registry pattern, like payments)
```
The `ramp_partners` registry mirrors the existing **payment-provider registry** —
on-ramp / off-ramp / custody are pluggable adapters, so Bridge / Yellow Card /
Fireblocks drop in the same way Zaad and M-Pesa did.

## 8. Migration path (non-breaking, phased)

1. **Additive schema** — add the JournalLine columns (defaulted) + new tables.
   Nothing existing changes; single-currency books keep working untouched.
2. **Treasury book + chart** — stand up the platform treasury tenant + accounts
   1900/1905/2600/4900/4910; wire the reconciliation job against a **custody
   sandbox** (no real funds).
3. **On-ramp adapter** (one partner, sandbox) → fund a wallet end-to-end in test,
   exactly as the M-Pesa STK reconciliation was tested with a stub + simulated
   callback.
4. **Off-ramp adapter** + merchant-agent cash-out → close the loop in one corridor.
5. **Go-live gates (external):** Sharia ruling, partner-of-record VASP/MSB,
   on/off-ramp + custody contracts, AML/KYC + sanctions screening.

## 9. What this reuses (you're not starting from zero)

- **`wallet` module** → the user-facing balance, now reserve-backed.
- **GL `postJournal`** → extended, not replaced; every existing posting still valid.
- **M-Pesa async-settlement clearing pattern** → exactly the on/off-ramp model
  (pending → confirm on callback → reconcile).
- **payment-provider registry** → the template for ramp/custody adapters.
- **`2300 Charity Payable`** → the riba-free destination for reserve yield.
- **credit module's diaspora payment links** → the front-end the on-ramp funds.

**Bottom line:** the hard internal lift is (a) multi-currency on the journal line
and (b) the reserve ledger + reconciliation invariant. Both are additive to the
existing spine. Everything else is adapters and partner contracts — and the
merchant network you already have is the off-ramp grid that makes it defensible.
