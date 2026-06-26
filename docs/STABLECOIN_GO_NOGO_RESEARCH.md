# Stablecoin Settlement Rail — Go/No-Go Research

**Question.** Can we use a USD stablecoin (USDC) as the *invisible* cross-border
settlement rail for a diaspora→merchant remittance product in the Horn of Africa
(Somalia/Somaliland first, then Kenya, Ethiopia), operated by Balanzify as the
POS/ERP + embedded-finance platform that owns the merchant network as the
cash-out grid? Users transact only in local / mobile money (Zaad, eDahab, EVC,
M-Pesa, Telebirr); custodial, fully abstracted, users never hold keys.

**Verdict: GO — conditional.** The corridor is technically and commercially
buildable, but only if structured around **licensed partners-of-record** rather
than Balanzify holding any money-transmitter or VASP licence itself. The hard
gates are jurisdictional and asymmetric, and — critically — the *stated first
market (Somalia) is the least-evidenced part of the plan*: no verified off-ramp
partner confirms USDC→Zaad/eDahab/EVC coverage. All proven last-mile off-ramps
are Kenya/M-Pesa-centric.

Method: fan-out web research, 22 sources fetched, 45 claims extracted, 25
adversarially verified (3-vote, need 2/3 to refute) → 24 confirmed, 1 killed.
Several central-bank/regulator URLs returned 403 to automated fetchers;
verification leaned on indexed verbatim text + independent corroboration.

---

## 1. Regulatory stance per market (the jurisdictional gates)

| Market | Status | What it means for us |
|--------|--------|----------------------|
| **Somalia / Somaliland** | **Regulatory vacuum.** No formal digital-asset framework; only central-bank warnings against virtual assets. | *Permissive* for invisible backend USDC plumbing, but **no licensing certainty, no consumer-protection regime, and no verified off-ramp partner into Zaad/eDahab/EVC.** This is the gap that gates a Somalia-*first* launch. |
| **Kenya** | **Permissible but not yet operational.** VASP Act 2025 in force (gazetted 21 Oct 2025, effective 4 Nov 2025). CBK supervises payments/custody/wallets/stablecoin issuance; CMA supervises exchanges/tokens. **No VASP licensed yet** — Treasury implementing regulations still pending (draft out for consultation ~Jan 2026). | Cleared *in the interim* by routing through a licensed partner-of-record (e.g. Yellow Card, licensed in ~20 African markets incl. Kenya). Time-sensitive — licensing window can open within months. |
| **Ethiopia** | **Highest risk.** NBE prohibits **Birr-paired crypto P2P** (effective 27 Feb 2026) unless explicitly authorized, citing absent AML/CFT safeguards, volatility, FX manipulation, fraud. Not a blanket ban (mining separately allowed). | **Gates any Birr-paired conversion leg.** Cleared only by NBE authorization, which does not yet exist. Keep Ethiopia out of the initial corridor. |

> Refuted (do not rely on): the claim that Somalia's Federal Government holds
> *exclusive* constitutional authority over monetary policy barring Somaliland/
> Puntland from legislating — refuted 0-3.

## 2. Send-side (on-ramp): cleared by partners

FinCEN's framework (FIN-2013-G001; extended to stablecoins by FIN-2019-G001) is
the key that keeps Balanzify *off* the licensing hook:

- Diaspora **senders** and merchant **cash-out recipients** are "**users**" — not
  MSBs, no registration/reporting.
- The fiat→USDC→fiat **conversion/transmission layer** is the regulated
  "administrator/exchanger" money transmitter — **a gate that licensed on-ramp
  partners absorb**.

Available licensed on-ramp partners-of-record:
- **Bridge (a Stripe company)** — supports USDC/USDT/EURc/PYUSD/USDB; handles
  reserve management, security, liquidity, GENIUS-ready compliance. (Note:
  "Open Issuance" is for minting a *new* stablecoin — distinct from simply
  *using* USDC, which is what we want.)
- **MoonPay (UK) Ltd** — FCA-registered cryptoasset business (FRN 944716, listed
  9 Dec 2022). *Caveat: AML/CTF registration only, not full authorization; not
  FSCS-protected.*
- **Conduit** — stablecoin cross-border network already integrated into local
  banks across Africa/Americas/Europe/Asia (SWIFT alternative).

## 3. Custody + off-ramp: stack exists for Kenya, NOT proven for Somalia

- **Custody:** Fireblocks MPC Wallets-as-a-Service (used by Yellow Card; secures
  up to 14M MPC wallets — vendor-reported).
- **Off-ramp / liquidity:**
  - **Yellow Card** — off-ramps USDC/USDT/PYUSD, licensed in ~20 African
    countries incl. Kenya + M-Pesa cash-out.
  - **Kotani Pay** — USDC/USDT/cUSD direct to mobile money; **documented
    USDC→M-Pesa cash-out in ~1 minute** (UNICEF Venture Fund pilot).
  - **Conduit–Onafriq** — USDC→local currency across 40+ African countries.

> **KEY GAP (gates Somalia-first):** *none* of the verified off-ramp partners
> confirm Somalia/Somaliland (Zaad/eDahab/EVC) coverage. Kotani's footprint
> explicitly excludes Somalia, Somaliland, Ethiopia. The proven last mile is
> Kenya/M-Pesa.

## 4. Stablecoin + chain — under-resolved

Partners broadly support **USDC**, so USDC is a usable settlement asset. But the
*comparative* USDC-vs-USDT liquidity in the specific Horn corridor, and the chain
trade-offs (Base vs Solana vs Tron on fees/liquidity/compliance), were **not
resolved** by surviving claims. (Background signal: stablecoins are ~40–43% of
Sub-Saharan crypto volume; Tron hosts ~46% of global USDT — i.e. USDT/Tron has
deep East-African liquidity, relevant if off-ramp partners price better in USDT.)
**Open question — resolve with the chosen off-ramp partner.**

## 5. Sharia — permissible as a transfer medium (medium confidence)

A fiat-backed stablecoin used *purely as a transfer medium* is treated as the
underlying fiat it represents → **permissible**. Basis: IIFA Secretary-General
Prof. Koutoub Moustapha Sano's three-type classification (delivered at the 21st
AAOIFI Sharia Council Conference, Manama, May 2023): crypto "backed by local
paper currencies such as the dollar… their ruling is the same as the currencies
they represent."

> Caveats (→ medium confidence): Sano is Secretary-General of **IIFA, not
> AAOIFI** (he only *spoke at* an AAOIFI conference); these were roundtable
> remarks, **not a formal standard or fatwa**; the source says nothing about the
> riba/reserve-interest question.

**Riba handling (design rule, sound practice not a sourced ruling):** hold
**non-interest-bearing reserves**, or route any reserve yield to **charity**
(2300 Charity Payable in our chart — already in the settlement spec). Before
launch, obtain a **formal scholarly-board ruling** specific to fiat-backed
stablecoins-as-transfer-media + reserve-interest disposition.

---

## Recommended corridor structure

**Partner-of-record stack (Balanzify never holds the licence):**

```
Diaspora sender (US/UK)
   │  fiat  →  [Bridge / Conduit / MoonPay]  ← holds MSB + FCA status
   ▼
 USDC (Fireblocks MPC custody — invisible, custodial, abstracted)
   │
   ▼  [Yellow Card / Kotani / Conduit–Onafriq]  ← holds local VASP/off-ramp licence
 Local cash / mobile money  →  Merchant cash-out grid (Balanzify-owned)
```

Balanzify stays the **POS/ERP + merchant-network + cash-out operator** — the
regulated transmission sits with partners on both ends.

### Strategic recommendation: invert the launch sequence

The research's sharpest finding is that **Somalia-first is the least-supported
leg** (no proven off-ramp) while **Kenya has the proven last mile** (USDC→M-Pesa,
1-minute) but a licensing window that's only just opening.

1. **Prove the corridor in Kenya first** via a licensed partner-of-record
   (Yellow Card / Kotani). This is where the rail demonstrably works today.
2. **Build the Somalia last mile as the moat.** In Somalia's regulatory vacuum,
   *our own merchant network becomes the off-ramp grid* — merchants accept USDC
   settlement and pay out in Zaad/eDahab/EVC at the counter. That's exactly the
   "merchants ARE the off-ramp" advantage that no incumbent (Dahabshiil et al.)
   or partner currently covers. Validate one Somali OTC/mobile-money liquidity
   partner before committing.
3. **Hold Ethiopia** until the NBE framework lands and authorizes a Birr leg.

### Hard gates vs. partner-cleared (summary)

| Item | Gates launch? | Cleared by |
|------|---------------|------------|
| US/UK fiat→USDC transmission | No (for us) | On-ramp partner's MSB/FCA status |
| Kenya in-country VASP activity | Until regs issue | Licensed local partner-of-record |
| Ethiopia Birr-paired leg | **Yes** | Only NBE authorization (doesn't exist) |
| Somalia off-ramp last mile | **Yes (evidence gap)** | Unverified — needs a named Somali partner / our merchant grid |
| Sharia compliance | Soft | Non-interest reserves + charity yield + formal ruling |

### Open questions to close before committing capital
1. Which licensed partner can actually settle USDC→Zaad/eDahab/EVC in Somalia?
2. USDC vs USDT and chain (Base/Solana/Tron) for *this* corridor's off-ramp
   liquidity and sanctions screening?
3. Does Kenya's forthcoming Treasury regulation permit a foreign platform to
   operate via a local partner-of-record, and when does licensing actually open?
4. A formal AAOIFI/recognized-board ruling on fiat-backed stablecoins as transfer
   media + reserve-interest disposition.

*Evidence is thin specifically on the Somalia last mile and on the chain/asset
choice; treat those two as the highest-priority diligence items.*
