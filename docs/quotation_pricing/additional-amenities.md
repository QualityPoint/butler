# Additional Amenities

> _Status: Planned._ Charging amenities **beyond** a bundle's composition. Applies
> only when `order_type == "Bundle"`.

A bundle has a fixed composition (e.g. `Spa: 3`, from `bundle_items`). When the client
wants **more** than that — or amenities from a category the bundle doesn't cover —
those extras are priced **exactly like the Amenities order type** (composed from the
amenity's annexes and add-ons, then the discount) and charged on top, into
`additional_total` / `additional_net_total`. The flat `bundle_price` covers everything
else.

---

## The `additional_amenity` checkbox (user-set)

A `Check` on each amenity line (`Butler Quotation Item.additional_amenity`). It is
**only needed for the in-bundle overflow case** — to resolve *which row's rate* prices
the overflow when an included category has several amenity rows.

- **Non-bundle categories are auto-additional** — every row in a category that isn't in
  `bundle_items` is charged as additional with **no tick required**.
- **In-bundle overflow needs a tick** — when an included category holds more placements
  than its configured count, the user ticks the ones that are extra. Each ticked
  placement is charged at its own price.

Safeguards:

- `before_validate` **clears** `additional_amenity` on every row when
  `order_type != "Bundle"`.
- Every drawn amenity is its own row, so an *included* placement and an *additional* one
  are separate rows by construction — there is nothing to keep apart.
- `carry_forward_overrides` restores the tick after a Facility Builder save, which would
  otherwise rebuild the table and silently un-designate every extra.

---

## The algorithm

Counted over **amenity rows only** — an annex is priced into its amenity and is never
charged separately. The amenity's unit price already contains its floor extra, so there
is no separate floors multiplier here any more.

### Category is NOT in the bundle  → auto-additional (no tick)

```
for every amenity row in the category:
    additional_total += row.qtn_amenity_amount      (the whole row)
```

### Category IS in the bundle  → tick each extra

Only the **ticked** placements are charged, each at its own amount:

```
for every ticked amenity row in the category:
    additional_total += row.qtn_amenity_amount
```

> This used to be `first_ticked.qtn_amenity_price × excess` — a consequence of
> consolidation, where N placements had collapsed into one row so there was nothing
> per-placement to tick and one row had to stand in for the rest. It also mispriced:
> three extras of different amenities were all billed at the first one's rate. With one
> row per placement, the honest rule is also the simpler one.

---

## Discount & totals (ERPNext model)

`additional_total` is discounted on the **same** terms as the bundle — see
[bundle.md](./bundle.md#discount--currency-erpnext-model):

```
additional_net_total = additional_total − (discount share)
base_additional_total / base_additional_net_total = ÷ conversion_rate
```

---

## Designation is validated (overflow only)

Only the **in-bundle overflow** needs designation. What the bundle covers is
`included = placed − ticked`; if that still exceeds the configured count, the surplus
can't be priced. Counting the ticks (rather than noting that a category has at least one)
is what stops a single tick licensing an overflow of any size:

```
validate       →  WARN  (msgprint, names the in-bundle categories holding undesignated extras)
before_submit  →  BLOCK (governed by action_if_bundle_items_unfulfilled + override role)
```

Non-bundle categories never trigger this (they're auto-additional).

See [validations.md](./validations.md#2-undesignated-extras).

---

## Worked example

Bundle **"Wellness"**: `Spa: 3`, `Gym: 2`. User places (2 distinct floors; Spa
`depends_on_floor_count`):

| Category | In bundle | placed | configured | ticked | Additional charge |
|---|---|---|---|---|---|
| Spa | yes (3) | 5 | 3 | 2 (@ 800 and 950) | `800 + 950 = 1750` |
| Gym | yes (2) | 2 | 2 | — | `0` (no overflow) |
| Pool | no | 1 | — | Pool, amount 600 | `600` (whole row) |

```
additional_total     = 1600 + 600 = 2200
additional_net_total = 2200 − discount share
```
