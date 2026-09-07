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
| **Amenities** | Sum of the amenity rows | Each group's `(Σ annexes + add-ons) × amenity_qty` |
| **Bundle** | A flat bundle price, **plus** any extra amenities | `bundle_price` + `additional_total` |
| **Quotation** | **Same as Amenities** (sum of the rows) | Each group's `(Σ annexes + add-ons) × amenity_qty` |

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

**Currency on Create → Sales Order.** A Sales Order is single-currency, and every
`qtn_amenity_price` is **already converted to the document currency** at the quotation
stage, so the SO only needs one rate. Only **amenity rows** are mapped — one Sales Order
Item each, via `Amenity.amenity`, at `qty = amenity_qty` and `rate = qtn_amenity_price`;
annex rows are quotation-only detail, already priced into their amenity. `_make_sales_order` therefore carries: `currency` = the
quotation's; `conversion_rate` = the quotation's **document→company** rate (its
`exchange_rates` row for the document currency, else 1) — set *after* `set_missing_values`
so the SO doesn't re-fetch a possibly-different live rate, making base amounts reconcile
exactly; and `ignore_pricing_rule = 1` so a Pricing Rule can't recompute the
already-converted rates. The per-amenity source currencies are not carried (a single-
currency SO has nowhere for them, and they're already resolved into the rates).

---

## Document lifecycle (where pricing & checks run)

```
before_validate ──────────► validate ──────────────► before_submit
  │                          │                          │
  │ shape the rows           │ recompute prices         │ enforce hard rules
  │ • default company        │ • set_bundle_breakdown   │ • validate_dependencies
  │ • default valid          │ • calculate_totals       │ • validate_bundle_amenities
  │ • clear add. flag        │ • annex-price WARN/STOP  │   (unfulfilled / undesignated)
  │ • clear_row_type_fields  │ • validate_row_types     │
  │ • consolidate_amenities  │ • validate_valid_till    │
  │ • expand_amenity_rows    │                          │
  │ • order_amenity_rows     │                          │
```

`before_validate` is where the two row types are shaped: wrong-type fields are cleared,
duplicate amenity groups merged, missing annex rows seeded from the Amenity, and the
table re-laid-out as `amenity row → its annex rows`. See [annexes.md](./annexes.md).

Rule of thumb: **`validate` calculates and warns; `before_submit` blocks.**
Amounts are recomputed on every save so the form always shows correct numbers;
the governance throws are deferred to where the spec requires them.

**Live recompute (no save):** Butler has no client-side calc mirror — the server is the
single source of truth. So the form calls the whitelisted `recalculate` method (which
runs `calculate_totals` **without** the governance throws) on any pricing input change —
an annex price, annex quantity or uom, `amenity_qty`, the light/sound/floor prices, the
amenity or floor type, a tax row, discount, bundle price, currency rate, or the
`disable_rounded_total` toggle (stricter than ERPNext's own Quotation, which has no
field trigger for that checkbox either). The recomputed doc is synced back and the
fields refresh immediately. `calculate_totals` is therefore
kept **throw-free**; the annex-price / bundle governance lives in `validate`.

---

## Shared primitives

These are used by both order types — see [amenities.md](./amenities.md) for detail.

- **`get_annex_price(annex, amenity, facility_type)`** — the standard for one annex: the
  **Annex Price** scoped to the facility type, else the facility-type-agnostic row. The
  existence of a scoped row is what makes a price changeable.
- **`get_amenity_pricing(amenity, facility_type)`** — an amenity's standard price,
  composed by summing its annexes at their `get_annex_price` rates. Used by the server
  **and** the client form.
- **`floor_count`** — number of *distinct* `floor_type`s across the amenity rows.
- **Group amount** — `(Σ annex_amount + light + sound + floor) × amenity_qty`, where the
  floor extra is `floor_extra_price × floor_count` only when the amenity
  `depends_on_floor_count` (else `0`). See [annexes.md](./annexes.md).

---

## Files

| File | Covers |
|---|---|
| [annexes.md](./annexes.md) | **The row model** — amenity rows, annex rows, and how an amenity's price is composed |
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
| Annex-composed amenity pricing (amenity + annex row types, server-side row shaping) | **Implemented** |
| Per-facility-type annex pricing via **Annex Price** (`get_annex_price`) | **Implemented** |
| Per-amenity add-ons: light system (Neutral/Add/Subtract), flat sound system, additive floor extra | **Implemented** |
| Three currency tiers on the line (`amenity` / `qtn_` / `base_`), `qtn_annex_price` authoritative | **Implemented** |
| `amenities_html` custom line editor (the child table itself is hidden + read-only) | _Planned_ |
| Bundle flat price + breakdown population | **Implemented** |
| Annex-price governance (`maintain_annex_price_action` + override role) | **Implemented** |
| Bundle composition validation (currently exact-match) | **Implemented** |
| `default_bundle_price` / editable `bundle_price` / `max_discount` line-discount check | **Implemented** |
| Additional amenities (`additional_total`, user-set checkbox) | **Implemented** |
| **Unfulfilled** + **undesignated overflow** checks (warn in validate / govern at submit) | **Implemented** |
| ERPNext-compatible calc fields built on Butler Quotation Item + header | **Implemented** |
| ERPNext-style discount / `grand_total` / `rounded_total` / `base_*` composition | **Implemented** |
| Taxes & charges (`taxes` rows, `charge_type` formulas) — engine mirrored over the net base | **Implemented** |
| `tax_category` → template auto-resolution (Tax Rule) → `taxes` populated | **Implemented** |
| Default tax template auto-loaded on a new quotation / company change (`apply_default_taxes`) | **Implemented** |
| Inclusive tax (`included_in_print_rate`) — combined-base back-out (`_resolve_exclusive_gross`) | **Implemented** |
| `in_words` / `base_in_words` — Butler's own `format_currency_in_words`, not ERPNext's `money_in_words` | **Implemented** |
| `base_*` (company-currency) fields shown only in multi-currency; rate fields editable then (ERPNext parity) | **Implemented** |
| Granular multi-currency: per-currency rates in the **Currency Exchange Rates** table (document / amenity / bundle currencies), auto-fetched from Currency Exchange; document & bundle rates are computed locals | **Implemented** |
| Create → Sales Order (Amenities) | **Implemented** |
| Create → ERPNext Quotation (Quotation type) | _Planned_ |

This reference documents the **target design**; sections marked _Planned_ describe
agreed behavior not yet in the code.
