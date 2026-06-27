# Amenities Order Type

`order_type == "Amenities"`. The quotation is priced **bottom-up**: every amenity
line is priced from its standard price (with optional manual override), and the
header totals are the sum of the lines.

All logic is in `ButlerQuotation.calculate_totals()`, run during `validate`.

> **`Quotation` order type uses this exact pricing path.** The only difference is
> downstream: `Amenities` → ERPNext **Sales Order**, `Quotation` → ERPNext
> **Quotation** (it cannot become a Sales Order). See
> [README.md](./README.md#downstream--the-post-submit-create-action).

---

## Step 1 — Resolve the standard price

```
get_amenity_pricing(amenity, facility_type)
        │
        ├─ price = Amenity.standard_price
        │
        └─ if Amenity.has_changeable_price and facility_type:
               price = facility_type_prices row matching facility_type   (if any)

   returns { amenity_price, depends_on_floor_count }
```

`facility_type` comes from the quotation's `facility_type`, falling back to the
linked `Facility.facility_type`. The same function backs the client form, so the
standard price shown live and the one used server-side are always identical.

---

## Step 2 — Per-line amount

For each row in `amenities`:

| Field | Set to |
|---|---|
| `amenity_price` | the resolved standard price (reference only) |
| `rate` | kept as entered; **defaults to `amenity_price`** when empty |
| `amount` | `floors × rate × qty` |

Where:

```
floor_count = number of DISTINCT floor_type values across all amenity lines
floors      = floor_count   if amenity.depends_on_floor_count and floor_count
              1             otherwise
```

A **price deviation** is recorded when `abs(rate − amenity_price) > 0.005` — i.e.
the user overrode the standard price. Deviations feed standard-price governance
(see [validations.md](./validations.md)).

---

## Step 3 — Header totals

```
amenity_count = Σ qty
total         = Σ amount            (items_total)
discount_amount, additional_discount_percentage   ← from apply_discount_by
net_total     = total − discount_amount
```

Additional discount (`apply_discount_by`):

- `Percentage` → `discount_amount = total × additional_discount_percentage / 100`
- `Amount` → `additional_discount_percentage = discount_amount / total × 100`
- _(blank)_ → both zeroed

---

## Standard-price governance

For `Amenities`, the check covers **every** deviating line, governed by
`maintain_standard_price_action`. See [validations.md](./validations.md#standard-price).

---

## Worked example

Facility has 2 distinct floor types. Amenity **Pool** (`depends_on_floor_count = 1`,
standard 500), **Reception** (no floor dependency, standard 300).

| Line | qty | rate | floors | amount |
|---|---|---|---|---|
| Pool | 1 | 500 | 2 | `2 × 500 × 1 = 1000` |
| Reception | 2 | 300 | 1 | `1 × 300 × 2 = 600` |

```
amenity_count = 3
total         = 1600
net_total     = 1600 − discount
```
