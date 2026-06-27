# Additional Discount (ERPNext model + `discount_mode`)

> _Status: Planned for Butler Quotation._ The header (document-level) discount, after
> ERPNext's `set_discount_amount` / `apply_discount_amount`
> (`erpnext/controllers/taxes_and_totals.py`), adapted to Butler's single
> `discount_mode` field.

This is the **document** discount (not per-line). Same engine across Quotation, Sales
Order, and Sales Invoice.

---

## The fields

### ERPNext (two inputs)

| Field | Role |
|---|---|
| `apply_discount_on` | `Net Total` or `Grand Total` — what the discount is taken off |
| `additional_discount_percentage` | the discount as a **%** |
| `discount_amount` | the discount as a **currency amount** |

ERPNext lets you type **either** the % or the amount; the % is converted to an amount.

### Butler's adaptation

Butler replaces the two inputs with a **mode switch + one value**:

| Field | Role |
|---|---|
| `apply_discount_on` | `Net Total` / `Grand Total` (unchanged) |
| `discount_mode` | `Percentage` or `Amount` |
| `discount_amount` (Float) | holds the **%** when mode = Percentage, the **amount** when mode = Amount |

Mapping to ERPNext:

```
discount_mode == "Percentage"   ≈  ERPNext additional_discount_percentage  (value is a %)
discount_mode == "Amount"       ≈  ERPNext discount_amount                 (value is currency)
```

---

## Step 1 — resolve the amount (`set_discount_amount`)

`scrub(apply_discount_on)` picks the base field: `Net Total → net_total`,
`Grand Total → grand_total`.

```
Percentage mode:  amount = base(apply_discount_on) × value / 100
Amount mode:      amount = value
```

Guard (on save): the resolved `discount_amount` may **not** exceed the total before
discount, else ERPNext throws *"Additional Discount Amount cannot exceed the total
before such discount"*.

`base_discount_amount = discount_amount × conversion_rate`.

---

## Step 2 — apply it (`apply_discount_amount`)

The discount is **distributed across the items** proportionally to each item's
`net_amount`, then totals are recomputed:

```
for each item:
    distributed = discount_amount × item.net_amount / total_for_discount
    item.net_amount −= distributed
→ recalculate (net_total, taxes, grand_total)
```

`total_for_discount` (`get_total_for_discount_amount`):

| `apply_discount_on` | base used | effect |
|---|---|---|
| **Net Total** | `net_total` | discount lowers the net **before** taxes → taxes computed on the discounted net |
| **Grand Total** | `grand_total − actual taxes` | discount lowers the **final** total **after** taxes |

---

## Butler specifics

- **Applies to both** the bundle and the additional amenities: `net_total` (from
  `bundle_price`) **and** `additional_net_total` (from `additional_total`) carry the
  discount share. See [bundle.md](./bundle.md#discount--currency-erpnext-model).
- **Two discount layers, like ERPNext.** This header discount is the **document**
  discount (≈ ERPNext `apply_discount_on`). It is **separate** from the bundle's
  **line-level** discount — `default_bundle_price` (≈ `price_list_rate`) → `bundle_price`
  (≈ `rate`) — which is the one capped by `Butler Bundle.max_discount`. See
  [bundle.md](./bundle.md#max-discount-floor) and
  [validations.md](./validations.md#standard-price--maintain_standard_price_action).
  `max_discount` does **not** apply to this header discount.

---

## Worked example

`net_total = 1000`, `apply_discount_on = Net Total`.

| `discount_mode` | `discount_amount` | resolved amount | new `net_total` |
|---|---|---|---|
| Percentage | `10` | `1000 × 10/100 = 100` | `900` |
| Amount | `150` | `150` | `850` |

(For a Bundle, the same resolved amount is split proportionally between the bundle base
and `additional_total`.)
