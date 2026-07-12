# Taxes & Charges (ERPNext model)

> _Status: Implemented._ Butler adopts ERPNext's tax engine verbatim. The fields are
> already on the doctype: `tax_category`, `taxes_and_charges`, and the `taxes` child
> table (**Sales Taxes and Charges**).

The same engine — `erpnext.controllers.taxes_and_totals.calculate_taxes_and_totals` —
powers **Quotation, Sales Order, and Sales Invoice** (all share these fields and call
it from `calculate_taxes_and_totals()`). Reference: `erpnext/controllers/taxes_and_totals.py`.

---

## How the `taxes` table is populated

Three entry points, all client-side in `butler_quotation.js`, all funnelling into the
same `taxes` child table:

```
1. New document           get_default_taxes_and_charges(company)  ──► the company's
   (onload_post_render,       is_default=1 template, with its rows already resolved
    company change)           (one round trip — no separate row-copy step)

2. tax_category / party   Tax Rule: get_tax_template(tax_category, party, address,
   change                     company, transaction_date)  ──► taxes_and_charges
                                     │
3. taxes_and_charges      get_taxes_and_charges(master_doctype, master_name)  ──► copies
   change (manual pick        the template's rows (stripping name/parent) into `taxes`
   or set by 1/2 above)
```

- **1. Default template on creation (`apply_default_taxes`, implemented):** fires on a
  brand-new quotation before any party is picked (`onload_post_render`, guarded to skip
  once the doc already carries un-templated rows), and again whenever `company` changes.
  Calls `erpnext.controllers.accounts_controller.get_default_taxes_and_charges`, which
  looks up the **`is_default=1`** Sales Taxes and Charges Template for that company and
  returns it pre-populated with its rows — `taxes_and_charges` and `taxes` are set in one
  call. Exact mirror of ERPNext `transaction.js` `apply_default_taxes`.
- **2. Tax Rule resolution (`set_taxes_from_tax_category`, implemented):** changing
  `tax_category` (or the party) calls `erpnext.accounts.party.set_taxes` — which matches
  a **Tax Rule** by tax_category + party + billing address + company +
  `transaction_date` — and sets `taxes_and_charges` to the resolved template,
  **overwriting** whatever step 1 loaded. Empty `tax_category` matches Tax Rules with an
  empty category.
- **3. Row copy (`populate_taxes_from_template`, implemented):** any `taxes_and_charges`
  change (manual pick, or set by step 1/2) calls `get_taxes_and_charges` to copy the
  template's rows into `taxes`.

---

## A `taxes` row (Sales Taxes and Charges)

| Field | Meaning |
|---|---|
| `charge_type` | how the row is computed (see below) |
| `account_head` | the tax/charge account |
| `rate` | percentage or per-unit value |
| `row_id` | the row this one references (for "Previous Row" types) |
| `included_in_print_rate` | **inclusive** — the item rate already contains this tax |
| `add_deduct_tax` | Add / Deduct (purchase side) |
| `tax_amount`, `total` | computed tax for the row, and the running cumulative total |
| `tax_amount_after_discount_amount` | tax after the additional discount |
| `base_*` | company-currency mirrors |

### `charge_type` formulas (per item, then summed)

| `charge_type` | current tax on an item |
|---|---|
| **On Net Total** | `rate/100 × item.net_amount` |
| **On Previous Row Amount** | `rate/100 × (referenced row's tax for this item)` |
| **On Previous Row Total** | `rate/100 × (referenced row's cumulative total for this item)` |
| **On Item Quantity** | `rate × item.qty` (a per-unit charge) |
| **Actual** | a fixed `tax_amount` entered manually, distributed across items proportionally to `net_amount` |

`row_id` is required for the two "Previous Row" types and forbidden for the others.

### Grid wiring (ERPNext `accounts.js` parity)

`butler_quotation.js` mirrors ERPNext's taxes-grid controller:

- **`account_head`** filtered (per row) to the company's `Tax` / `Chargeable` /
  `Expense Account` accounts via `erpnext.controllers.queries.tax_account_query`;
  **`cost_center`** filtered to the company.
- Selecting `account_head` fetches its `tax_rate` + `account_name`
  (`get_tax_rate`) into `rate` / `description`.
- `charge_type` ↔ `row_id` consistency is validated on `charge_type` / `rate` /
  `tax_amount` / `row_id` change (`validate_tax_row`), and again **server-side** in
  `validate_taxes` via ERPNext's `validate_taxes_and_charges`.
- `rate` is mandatory for rate-based charge types; `tax_amount` for **Actual**.
- **Inclusive taxes** (`included_in_print_rate`) are **supported** — see
  [Inclusive tax](#inclusive-tax) below. Eligibility (never `Actual`; a "Previous Row"
  type requires the referenced row(s) to also be inclusive; never a `Valuation`-category
  charge) is validated both client-side (`validate_inclusive_tax` in
  `butler_quotation.js`, reverting the checkbox on failure) and server-side
  (`validate_taxes` → ERPNext's own `validate_inclusive_tax`).

---

## The calculation pipeline (`_calculate`)

```
calculate_item_values     → item.amount, item.net_amount, base_*
initialize_taxes          → reset/validate each tax row
determine_exclusive_rate  → for INCLUSIVE taxes, back the net out of the gross rate
calculate_net_total       → total      = Σ item.amount
                            net_total   = Σ item.net_amount
calculate_taxes           → per (item × tax): accumulate tax.tax_amount,
                            build each row's running `total` (cumulative)
calculate_totals          → grand_total = last tax row's `total`  (or net_total if no taxes)
                            total_taxes_and_charges = grand_total − net_total
set_rounded_total         → round grand_total to the currency fraction;
                            rounding_adjustment = rounded_total − grand_total
```

Then the discount is applied — see [discount.md](./discount.md).

**Inclusive taxes** (`included_in_print_rate`): the entered `rate` already includes the
tax, so `determine_exclusive_rate` divides it out to recover `net_amount` before taxes
are recomputed — the printed/entered price stays unchanged.

**Currency:** every monetary field has a `base_*` twin = `value × conversion_rate`
(transaction → company currency).

---

## Inclusive tax

ERPNext backs the tax out **per item** (`determine_exclusive_rate`): every
`included_in_print_rate` row contributes a fraction (or, for "On Item Quantity", a flat
per-unit amount) that's divided out of each item's entered `amount` to get its
`net_amount` — the entered price is unchanged, only the net/tax split underneath it
shifts. Butler has **one combined base**, not a per-item table, so
`ButlerQuotation._resolve_exclusive_gross(gross, total_qty)` adapts the same math to
that single number: it walks `self.taxes` once, accumulating each inclusive row's own
fraction (chained through "On Previous Row Amount/Total" via a running
`grand_fractions` list, mirroring ERPNext's `tax_fraction_for_current_item` /
`grand_total_fraction_for_current_item`) plus a flat total for inclusive "On Item
Quantity" rows, then returns `(gross - flat_total) / (1 + cumulated_fraction)`. It's a
no-op (returns `gross` unchanged) when no row is inclusive.

`calculate_discount_taxes_and_totals()` calls this once, right where `gross_bundle` /
`gross_additional` / `gross` are combined — then scales `gross_bundle` and
`gross_additional` down by the same ratio (the same proportional-split convention the
header discount already uses) **before** any of the existing discount/ceiling/
`_apply_taxes` logic runs. Every tax row — inclusive or not — then computes its
`tax_amount` off that same backed-out base in `_apply_taxes`, unchanged. Net effect:
`grand_total` reconciles back to the original entered `bundle_price`/`total` (no
double-charge) when every tax is inclusive; an exclusive tax stacked on top still adds
on top of the reduced base, exactly as in ERPNext.

---

## What Butler does

ERPNext's `calculate_taxes_and_totals` hard-requires an `items` child table, which
Butler doesn't have (its lines are `amenities`). So Butler **mirrors** the engine
rather than delegating: `ButlerQuotation._apply_taxes()` walks the `taxes` rows over a
single net base applying the documented `charge_type` formulas, and
`calculate_discount_taxes_and_totals()` / `set_rounded_total()` / `set_base_amounts()`
compose `total_taxes_and_charges`, `grand_total`, `rounded_total` and the `base_*`
mirrors. The taxable base is the net of the amenity lines (Amenities/Quotation) or of
`bundle_price + additional_total` (Bundle), backed out for inclusive tax by
`_resolve_exclusive_gross` (see above) before `_apply_taxes` ever runs. Per-item tax
templates are out of scope (the per-item tax map defaults to `{}`) — Butler has no
`items` table to attach one to.
