# Amenities Order Type

`order_type == "Amenities"`. The quotation is priced **bottom-up**: every annex is priced
from its standard, each amenity is the sum of its annexes plus its add-ons, and the header
totals are the sum of the amenity rows.

All logic is in `ButlerQuotation.calculate_totals()`, run during `validate`.

> **`Quotation` order type uses this exact pricing path.** The only difference is
> downstream: `Amenities` → ERPNext **Sales Order**, `Quotation` → ERPNext
> **Quotation** (it cannot become a Sales Order). See
> [README.md](./README.md#downstream--the-post-submit-create-action).

> A line is a **group** of rows — one amenity row and its annex rows — not a single row.
> Read [annexes.md](./annexes.md) first; this page covers what happens above that.

---

## Step 1 — Resolve the rates

```
rate_map = sync_exchange_rates(company_currency)     # one rate per currency → company

per amenity group:
    base_exchange_rate = rate_map[amenity_currency]              # amenity → company
    qtn_exchange_rate  = base_exchange_rate / rate_map[currency] # amenity → quotation
```

Both are read-only mirrors of the **`exchange_rates` table**, the single editable rate
source, so one currency can never carry two different rates across rows. The annex rows
inherit their group's rates.

---

## Step 2 — Per-group amount

For each amenity group (see [annexes.md](./annexes.md) for each component's formula):

| Field | Set to |
|---|---|
| `annex_amount` | `annex_price × annex_quantity` — per annex row |
| `light_system_amount` | `±price × used_lines` per the mode; the remaining lines are charged separately as `default_system_amount` |
| `sound_system_amount` | `sound_system_price` when `has_sound_system`, else `0` |
| `floor_amount` | `floor_price × floor_qty` |
| `amenity_price` | `Σ annex_amount + light + sound + floor` — **per unit**, amenity currency |
| `qtn_amenity_price` | `amenity_price × qtn_exchange_rate` |
| `qtn_amenity_amount` | `qtn_amenity_price × amenity_qty` (always 1 — one row is one placement) |

Where:

```
floor_count = number of DISTINCT floor_type values across all amenity rows
floor_qty   = floor_count   if amenity.depends_on_floor_count
              0             otherwise
```

A **price deviation** is recorded when the user's `qtn_annex_price` differs from the Annex
Price standard by more than `0.005`. Only the annex price is governed — it is the only
editable price with a published standard. See
[validations.md](./validations.md#annex-price--maintain_annex_price_action).

> Floors are **additive** here, not a multiplier on the line. See
> [annexes.md](./annexes.md#the-per-amenity-add-ons).

---

## Step 3 — Header totals

```
amenity_count = number of amenity rows   (one per drawn placement)
total         = Σ qtn_amenity_amount     (quotation currency)
net_total     = total − discount
```

Then taxes, grand/rounded totals and the `base_*` mirrors, unchanged — see
[discount.md](./discount.md) and [taxes_and_charges.md](./taxes_and_charges.md).

The header discount is shared back down for display: each amenity row's
`qtn_amenity_net_amount`, and each annex row's `qtn_annex_net_amount`, are its
pro-rata share. Those `net_` figures are **guidance only** — nothing is charged from
them, which is why the split can stay proportional.

---

## Standard-price governance

Every deviating **annex** price is checked, governed by `maintain_annex_price_action`.
See [validations.md](./validations.md#annex-price--maintain_annex_price_action).

---

## Dependant amenities

An Amenity can require another. Tick **Is Dependant Amenity** and list the ones it needs
in **Primary Amenities** (`Amenity.depends_on`): an *Intercom* needs an *Entrance* to be
fitted to. On a quotation the rule is a count cap — `count(Intercom) <= count(Entrance)` —
enforced by `validate_dependencies`.

**It changes no price.** Both are drawn separately in the Facility Builder and priced
independently; the dependency is a composition rule, not an arithmetic one. Full rules in
[validations.md](./validations.md#dependencies).

The master keeps the graph drawable:

| Rule | Error title |
|---|---|
| An amenity may not depend on itself | *Invalid Dependency* |
| A primary may not be listed twice | *Duplicate Primary Amenity* |
| No rings: `A → B → A`, or longer | *Circular Dependency* |

Unticking the checkbox clears the table (`clear_dependent_fields`, in `before_save`) —
which is why the validator returns early when the box is off: at `validate` time the rows
are still there, on their way out.

---

## Worked example

Facility is a Villa on 1 floor. Amenity **Lounge** (`depends_on_floor_count = 1`,
`floor_extra_price = 50`, `sound_system_price = 200`, a `Dimmer` light system priced 80 in
`Add` mode), composed of 2 annexes. A Villa-scoped **Annex Price** overrides the AC.

| Component | Detail | Amount |
|---|---|---|
| Motion Sensors | standard 100 × qty 2 | `200` |
| AC | Villa override 500 × qty 1 | `500` |
| Floor extra | 50 × 1 floor | `50` |
| Light system | Dimmer, `Add` | `+80` |
| Sound system | opted in | `200` |

```
amenity_price      = 200 + 500 + 50 + 80 + 200 = 1030      (per unit)
qtn_amenity_amount = 1030 × amenity_qty 1      = 1030
total                                          = 2060
```
