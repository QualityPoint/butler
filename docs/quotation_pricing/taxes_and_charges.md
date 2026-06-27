# Taxes & Charges (ERPNext model)

> _Status: Planned for Butler Quotation._ Butler adopts ERPNext's tax engine verbatim.
> The fields are already on the doctype: `tax_category`, `taxes_and_charges`, and the
> `taxes` child table (**Sales Taxes and Charges**).

The same engine — `erpnext.controllers.taxes_and_totals.calculate_taxes_and_totals` —
powers **Quotation, Sales Order, and Sales Invoice** (all share these fields and call
it from `calculate_taxes_and_totals()`). Reference: `erpnext/controllers/taxes_and_totals.py`.

---

## How the `taxes` table is populated

```
tax_category ──(Tax Rule: get_tax_template)──► a Sales Taxes and Charges Template
taxes_and_charges (Link to that template)
        │  get_taxes_and_charges(master_doctype, master_name)
        ▼  copies the template's rows (stripping name/parent)
taxes (child rows)
```

- **Auto-resolution (implemented):** changing `tax_category` (or the party) calls
  `erpnext.accounts.party.set_taxes` — which matches a **Tax Rule** by tax_category +
  party + billing address + company + `transaction_date` — and sets `taxes_and_charges`
  to the resolved template. The `taxes_and_charges` change then calls
  `get_taxes_and_charges` to copy the template's rows into `taxes`. (Butler form,
  `butler_quotation.js` → `set_taxes_from_tax_category` / `populate_taxes_from_template`.)
- You can also pick a `taxes_and_charges` template manually (filtered to the company's
  enabled templates); its rows populate `taxes` the same way.
- Empty `tax_category` matches Tax Rules with an empty category.

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
- **Inclusive taxes** (`included_in_print_rate`) are **rejected** — `_apply_taxes`
  doesn't model them, so they'd produce a silently wrong total.

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

## What Butler does

ERPNext's `calculate_taxes_and_totals` hard-requires an `items` child table, which
Butler doesn't have (its lines are `amenities`). So Butler **mirrors** the engine
rather than delegating: `ButlerQuotation._apply_taxes()` walks the `taxes` rows over a
single net base applying the documented `charge_type` formulas, and
`calculate_discount_taxes_and_totals()` / `set_rounded_total()` / `set_base_amounts()`
compose `total_taxes_and_charges`, `grand_total`, `rounded_total` and the `base_*`
mirrors. The taxable base is the net of the amenity lines (Amenities/Quotation) or of
`bundle_price + additional_total` (Bundle). Inclusive taxes and per-item tax templates
are out of scope (the per-item tax map defaults to `{}`).
