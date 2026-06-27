# Bundle Order Type

`order_type == "Bundle"`. The quotation is sold at a **flat bundle price**, decoupled
from how many amenities it contains. Amenities still appear on the quotation (and are
validated against the bundle's composition), but the base charge is the bundle price —
not the sum of the lines.

Extra amenities beyond the bundle's composition are charged separately; see
[additional-amenities.md](./additional-amenities.md).

---

## The two price fields

| Field | Role | Editable |
|---|---|---|
| `default_bundle_price` | the bundle's **standard** price, copied from `Butler Bundle.bundle_price` | read-only |
| `bundle_price` | the **actual** price charged; may be discounted by the user | editable |
| `bundle_currency` | copied from `Butler Bundle.currency` | read-only |

On selecting `bundle_type` (form **and** server), both `default_bundle_price` and
`bundle_price` seed from the bundle's standard price; the user may then lower
`bundle_price`. The server must **not** clobber a user-entered `bundle_price` on
later saves (only seed it when empty).

> _Planned:_ `default_bundle_price` and the editable `bundle_price` are agreed but
> not yet wired. Today `bundle_price` is simply refetched from the bundle each save.

---

## Max-discount cap (line-level discount)

`bundle_price` is to `default_bundle_price` what an ERPNext item's `rate` is to its
`price_list_rate` — a discounted price. `Butler Bundle.max_discount` (%) caps that
**line-level** discount:

```
line_discount_% = (default_bundle_price − bundle_price) / default_bundle_price × 100

line_discount_% > max_discount  →  standard-price governance fires   (see validations.md)
```

This is the Bundle-mode meaning of "the standard price is not maintained" — the governed
subject is `bundle_price` vs `default_bundle_price`, not the amenity lines. It is
**separate** from the document `discount_mode` discount (which `max_discount` does not
govern); see [discount.md](./discount.md).

---

## Base total

```
total = bundle_price            (NOT the sum of amenity amounts)
```

The amenity lines are still priced per [amenities.md](./amenities.md) — floors and all
(floors apply in **every** order type) — so each line's `amount` is available. But for
a Bundle the flat `bundle_price` **overrides** those amounts: they do **not** roll into
`total`. They drive the composition validation and the additional-amenity charge
([additional-amenities.md](./additional-amenities.md)) instead — the one exception
where amenity amounts are charged.

---

## Discount & currency (ERPNext model)

The doctype mirrors ERPNext's Quotation totals. The discount is entered once and
applies to **both** `bundle_price` and `additional_total`:

| Field | Meaning |
|---|---|
| `apply_discount_on` | `Net Total` or `Grand Total` |
| `discount_mode` | `Percentage` or `Amount` |
| `discount_amount` | the value for the chosen mode |
| `currency` / `conversion_rate` | transaction currency → company currency |
| `base_*` | every amount mirrored in company currency (`÷ conversion_rate`) |

```
net_total            = total − (discount share)
additional_net_total = additional_total − (discount share)
grand_total / rounded_total          ← ERPNext rounding
base_*                               ← company-currency mirrors
```

Amount-mode discounts are converted to a % for the `max_discount` validity check.

**Granular multi-currency** (ERPNext cross-rate, `rate × source→company / doc→company`):
each amenity and the bundle carries its own currency, converted to the document currency
via its own rate. See [reference.md](./reference.md#currency--multi-currency).

```
default_bundle_price[doc] = bundle_price × bundle_conversion_rate / conversion_rate
   bundle_conversion_rate = exchange(bundle_currency → company)   (Currency Exchange)
   conversion_rate        = exchange(document currency → company)
```

---

## Bundle composition (Bundle Items breakup)

A bundle's per-category amenity allowance is stored **inversely**: each `Amenity
Category` carries a `bundles` child table (`Amenity Category Bundle`) whose rows say
"for bundle X, this category allows N amenities".

```
get_bundle_breakdown(bundle)              ← single source of truth
   reads every Amenity Category Bundle row pointing at <bundle>
   returns [{ amenity_category, amenity_count }, ...]
```

`set_bundle_breakdown()` (in `validate`) mirrors this into the read-only `bundle_items`
table (doctype **Bundle Item**) on the quotation. The same function feeds the Facility
Builder's per-category placement caps — one source, two consumers.

---

## Worked example

Bundle **"Wellness"**: standard price 10 000, `max_discount = 10%`, composition
`Spa: 3`, `Gym: 2`.

```
default_bundle_price = 10000
bundle_price         = 9500   (user discount; floor = 9000 → allowed)
total                = 9500
bundle_items         = [ {Spa, 3}, {Gym, 2} ]
```

Add a 4th Spa → see [additional-amenities.md](./additional-amenities.md).
