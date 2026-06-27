# Quotation Pricing — Reference

How a **Butler Quotation** is priced and validated. This folder is the conceptual
reference for the pricing engine; the code lives in
`butler/butler/doctype/butler_quotation/butler_quotation.py` (+ `.js`).

Scope: the two pricing **order types**, `Amenities` and `Bundle`. The third type,
`Quotation`, is a placeholder to be designed later.

---

## Order types

| `order_type` | Priced as | Charged on |
|---|---|---|
| **Amenities** | Sum of the amenity lines | Every line's `qty × rate` (× floors) |
| **Bundle** | A flat bundle price, **plus** any extra amenities | `bundle_price` + `additional_total` |
| **Quotation** | **Same as Amenities** (sum of the lines) | Every line's `qty × rate` (× floors) |

`Quotation` and `Amenities` are priced by the **same** code path — they differ only in
the post-submit **Create** target (see below).

---

## Downstream — the post-submit "Create" action

After a Butler Quotation is submitted, the "Create" button maps it into a downstream
document. The target depends on `order_type`:

| `order_type` | Create →  |
|---|---|
| **Amenities** | **ERPNext Sales Order** (`make_sales_order`, one Sales Order Item per amenity) |
| **Quotation** | **ERPNext Quotation** — _cannot_ become a Sales Order directly |
| **Bundle** | _not yet supported_ |

This is a mapping concern, not a pricing one; pricing for `Quotation` is exactly the
Amenities engine.

**Currency on Create → Sales Order.** A Sales Order is single-currency, and every amenity
`rate` is **already converted to the document currency** at the quotation stage, so the
SO only needs one rate. `_make_sales_order` therefore carries: `currency` = the
quotation's; `conversion_rate` = the quotation's **document→company** rate (its
`exchange_rates` row for the document currency, else 1) — set *after* `set_missing_values`
so the SO doesn't re-fetch a possibly-different live rate, making base amounts reconcile
exactly; and `ignore_pricing_rule = 1` so a Pricing Rule can't recompute the
already-converted rates. The per-amenity source currencies are not carried (a single-
currency SO has nowhere for them, and they're already resolved into the rates).

---

## Document lifecycle (where pricing & checks run)

```
before_validate ──► validate ──────────────► before_submit
  │                   │                          │
  │ safeguards        │ recompute prices         │ enforce hard rules
  │ • default company │ • set_bundle_breakdown   │ • validate_dependencies
  │ • default valid   │ • calculate_totals       │ • validate_bundle_amenities
  │ • consolidate     │ • standard-price WARN     │   (unfulfilled / undesignated)
  │ • clear add. flag │ • validate_valid_till    │
```

Rule of thumb: **`validate` calculates and warns; `before_submit` blocks.**
Amounts are recomputed on every save so the form always shows correct numbers;
the governance throws are deferred to where the spec requires them.

**Live recompute (no save):** Butler has no client-side calc mirror — the server is the
single source of truth. So the form calls the whitelisted `recalculate` method (which
runs `calculate_totals` **without** the governance throws) on any pricing input change —
a rate, qty, amenity, tax row, discount, bundle price, or currency rate. The recomputed
doc is synced back and the fields refresh immediately. `calculate_totals` is therefore
kept **throw-free**; the standard-price / bundle governance lives in `validate`.

---

## Shared primitives

These are used by both order types — see [amenities.md](./amenities.md) for detail.

- **`get_amenity_pricing(amenity, facility_type)`** — the single source of truth for
  an amenity's standard price (base `standard_price`, overridden by a matching
  `facility_type_prices` row when the amenity `has_changeable_price`). Used by the
  server **and** the client form.
- **`floor_count`** — number of *distinct* `floor_type`s across the amenity lines.
- **Line amount** — `floors × rate × qty`, where `floors = floor_count` only when the
  amenity `depends_on_floor_count` (else `1`).

---

## Files

| File | Covers |
|---|---|
| [amenities.md](./amenities.md) | The `Amenities` order type, line pricing, totals |
| [bundle.md](./bundle.md) | The `Bundle` order type, flat price, max-discount, breakdown |
| [additional-amenities.md](./additional-amenities.md) | Charging amenities beyond the bundle composition |
| [taxes_and_charges.md](./taxes_and_charges.md) | ERPNext tax engine (`tax_category`, template, `taxes`) |
| [discount.md](./discount.md) | Header discount — ERPNext model + `discount_mode` |
| [validations.md](./validations.md) | Governance actions, the checks, when each runs |
| [reference.md](./reference.md) | Field & settings reference, whitelisted functions |

---

## Implementation status

| Concept | Status |
|---|---|
| Amenities line pricing + totals | **Implemented** |
| Bundle flat price + breakdown population | **Implemented** |
| Standard-price governance (all order types, all rows) | **Implemented** |
| Bundle composition validation (currently exact-match) | **Implemented** |
| `default_bundle_price` / editable `bundle_price` / `max_discount` line-discount check | **Implemented** |
| Additional amenities (`additional_total`, user-set checkbox) | **Implemented** |
| **Unfulfilled** + **undesignated overflow** checks (warn in validate / govern at submit) | **Implemented** |
| ERPNext-compatible calc fields built on Butler Quotation Item + header | **Implemented** |
| ERPNext-style discount / `grand_total` / `rounded_total` / `base_*` composition | **Implemented** |
| Taxes & charges (`taxes` rows, `charge_type` formulas) — engine mirrored over the net base | **Implemented** |
| `tax_category` → template auto-resolution (Tax Rule) → `taxes` populated | **Implemented** |
| `base_*` (company-currency) fields shown only in multi-currency; rate fields editable then (ERPNext parity) | **Implemented** |
| Granular multi-currency: per-currency rates in the **Currency Exchange Rates** table (document / amenity / bundle currencies), auto-fetched from Currency Exchange; document & bundle rates are computed locals | **Implemented** |
| Create → Sales Order (Amenities) | **Implemented** |
| Create → ERPNext Quotation (Quotation type) | _Planned_ |

This reference documents the **target design**; sections marked _Planned_ describe
agreed behavior not yet in the code.
