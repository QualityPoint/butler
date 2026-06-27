# Additional Amenities

> _Status: Planned._ Charging amenities **beyond** a bundle's composition. Applies
> only when `order_type == "Bundle"`.

A bundle has a fixed composition (e.g. `Spa: 3`, from `bundle_items`). When the client
wants **more** than that — or amenities from a category the bundle doesn't cover —
those extras are priced **exactly like the Amenities order type** (standard price,
floor multiplier, rate, and the discount) and charged on top, into `additional_total`
/ `additional_net_total`. The flat `bundle_price` covers everything else.

---

## The `additional_amenity` checkbox (user-set)

A `Check` on each amenity line (`Butler Quotation Item.additional_amenity`). It is
**only needed for the in-bundle overflow case** — to resolve *which row's rate* prices
the overflow when an included category has several amenity rows.

- **Non-bundle categories are auto-additional** — every row in a category that isn't in
  `bundle_items` is charged as additional with **no tick required**.
- **In-bundle overflow needs a tick** — when an included category has more than its
  configured count, the user ticks the row whose rate should price the excess.

Safeguards:

- `before_validate` **clears** `additional_amenity` on every row when
  `order_type != "Bundle"`.
- `consolidate_amenities` includes `additional_amenity` in its merge key, so an
  *included* unit and an *additional* unit of the same `amenity + floor_type` stay on
  separate rows.

---

## The algorithm

Floors apply in every case (`floors = floor_count` when the amenity
`depends_on_floor_count`, else `1`).

### Category is NOT in the bundle  → auto-additional (no tick)

```
for every row in the category:
    additional_total += row.amount      (= floors × rate × qty — the whole row)
```

### Category IS in the bundle  → tick required for the overflow

Only the **overflow** is charged; the ticked row supplies the **rate & floors**, the
category supplies the **quantity**:

```
excess = total_qty(category) − configured_count(category)
additional_total += floors × ticked_row.rate × excess
```

If several rows in one overflowing category are ticked, the **first** ticked row's
rate/floors are used.

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

Only the **in-bundle overflow** needs designation. If an included category's placed qty
exceeds its configured count but no row is ticked, the overflow can't be priced:

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

| Category | In bundle | total_qty | configured | ticked row | Additional charge |
|---|---|---|---|---|---|
| Spa | yes (3) | 5 | 3 | Spa @ rate 400, floors 2 | `2 × 400 × (5−3) = 1600` |
| Gym | yes (2) | 2 | 2 | — | `0` (no overflow) |
| Pool | no | 1 | — | Pool, amount 600 | `600` (whole row) |

```
additional_total     = 1600 + 600 = 2200
additional_net_total = 2200 − discount share
```
