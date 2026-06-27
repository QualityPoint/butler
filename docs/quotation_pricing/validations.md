# Validations & Governance

All quotation checks share one governance primitive and are driven by **Butler
Settings**. The pattern: `validate` calculates and **warns**; `before_submit`
**enforces** the hard rules.

---

## Governance primitive

`apply_governance_action(action, *, message, title, override_role)`:

```
action == "Warn"  →  msgprint (orange), continue
action == "Stop"  →  throw,
                     UNLESS the user holds `override_role`
                     →  msgprint (orange) + continue
```

Settings options are only **`Stop` / `Warn`** (no "Ignore"); default `Stop`. Each
governed action has a `Stop`-gated override role.

| Setting | Override role |
|---|---|
| `maintain_standard_price_action` | `role_to_override_standard_price_stop_action` |
| `action_if_bundle_items_unfulfilled` | `role_to_override_unfulfilled_stop_action` |

---

## Standard price — `maintain_standard_price_action`

The governed subject depends on order type:

| `order_type` | Checks (runs in `validate`) |
|---|---|
| **Amenities** / Quotation | **every** line whose `rate ≠ amenity_price` |
| **Bundle** | (a) `bundle_price` discounted past `max_discount` vs `default_bundle_price`; **and** (b) only **ticked additional** rows whose `rate ≠ amenity_price` |

For Bundle (a): the **line-level** discount — `(default_bundle_price − bundle_price) /
default_bundle_price × 100` (ERPNext item-discount style) — must be `≤ max_discount`;
otherwise governance fires. This is the bundle's own discount, **not** the document
`discount_mode` discount (which `max_discount` does not govern). The **included** bundle
lines aren't checked — they're covered by the flat `bundle_price`. See
[bundle.md](./bundle.md#max-discount-floor).

---

## Bundle composition

Two **distinct** Bundle-only checks.

### 1. Unfulfilled — `action_if_bundle_items_unfulfilled`

An included category has **fewer** amenities than configured.

```
for each category in bundle_items:
    if total_qty(category) < configured:  → unfulfilled
```

| Stage | Behavior |
|---|---|
| `validate` | **Warn only** — msgprint, *even when the setting is `Stop`* |
| `before_submit` | Full governance — `Stop` throws unless override role (then warn+allow) |

### 2. Undesignated overflow

An **included** category's placed qty exceeds its configured count, but no row is
ticked `additional_amenity`, so the overflow can't be priced. (Non-bundle categories
are auto-additional and never trigger this.)

```
validate       →  WARN  (msgprint; the message names the in-bundle categories with undesignated extras)
before_submit  →  BLOCK (governed by action_if_bundle_items_unfulfilled + override role)
```

See [additional-amenities.md](./additional-amenities.md).

---

## Dependencies

`validate_dependencies()` (`before_submit`, all order types): every amenity flagged
`is_dependant_amenity` must have its required `Amenity Depends On` amenities also
present. Independent of the pricing governance above.

---

## When each runs

| Check | `validate` | `before_submit` |
|---|---|---|
| `calculate_totals` (prices) | ✅ | — |
| Standard price / `bundle_price` discount | ✅ warn/throw per setting | — |
| Unfulfilled composition | ✅ **warn only** | ✅ governed (warn/throw) |
| Undesignated overflow | ✅ warn (names categories) | ✅ governed (warn/throw) |
| Dependencies | — | ✅ |
| `validate_valid_till` | ✅ | — |
