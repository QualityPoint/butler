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
| `maintain_annex_price_action` | `role_to_override_annex_price_stop_action` |
| `action_if_bundle_items_unfulfilled` | `role_to_override_unfulfilled_stop_action` |
| `action_if_dependencies_missing` | `role_to_override_dependency_stop_action` |
| `system_core_action` | `role_to_override_system_core_stop_action` |

---

## Row types

The `amenities` table holds **two row types** in one doctype (see
[annexes.md](./annexes.md)), so the mandatory flags that would normally express this
can't live on the fields — `annex_uom` as `reqd` would block every amenity row. They are
enforced in `validate_row_types()` instead:

| Row type | Must have | Must not have |
|---|---|---|
| Amenity (`annex` empty) | `amenity`, `floor_type`, a `placement_id` (backfilled) | annex fields |
| Annex (`annex` set) | `annex_quantity > 0`, `annex_uom`, a resolvable amenity row | the per-amenity add-on fields |

Fields belonging to the *other* row type are **cleared**, not rejected
(`clear_row_type_fields` in `before_validate`) — they are stale data, not a user error.
Two things do throw: an annex row matching no amenity row (unattached), and an annex that
isn't one of its amenity's own configured annexes.

---

## Annex price — `maintain_annex_price_action`

`qtn_annex_price` is the only editable price with a published standard, so it is the only
one governed. The standard is the **Annex Price** for `(annex, amenity, facility_type)`,
falling back to the facility-type-agnostic row.

| `order_type` | Checks (runs in `validate`) |
|---|---|
| **Amenities** / Quotation | **every** annex row whose `qtn_annex_price` deviates from its Annex Price standard by more than `0.005` |
| **Bundle** | the same, **plus** `bundle_price` discounted past `max_discount` vs `default_bundle_price` |

The light system, sound system and floor prices are also editable but are **not**
governed — they have no published per-facility-type standard to deviate from.

For Bundle: the **line-level** discount — `(default_bundle_price − bundle_price) /
default_bundle_price × 100` (ERPNext item-discount style) — must be `≤ max_discount`;
otherwise governance fires. This is the bundle's own discount, **not** the document
`discount_mode` discount (which `max_discount` does not govern). See
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

An Amenity can require another — an **Intercom** needs an **Entrance** to be fitted to.
`Amenity.is_dependant_amenity` gates the `depends_on` table (labelled *Primary
Amenities*), and `validate_dependencies(enforce)` enforces one rule, for every dependant
`D` on the quotation and every primary `P` it lists:

```
count(D placements)  <=  count(P placements)
```

Mere presence is the `capacity == 0` case, so there is no separate presence check.
Applies to **every order type** — there is no `order_type` gate.

> ### It never touches money
>
> Both amenities are drawn separately in the Facility Builder and priced independently:
> the Entrance costs what an Entrance costs, each Intercom what an Intercom costs. The
> dependency never enters `calculate_totals`.
>
> **And it creates no link between rows.** Nothing records *which* Intercom belongs to
> *which* Entrance — only the totals are compared. That is deliberate: the client places
> them freely, and an Entrance with no Intercom fitted to it is perfectly legitimate. Do
> not add a `primary_placement_id`; there is nothing for it to mean.

**Counting is raw placements, on both sides.** Unlike `validate_bundle_amenities` next to
it, rows ticked `additional_amenity` are *not* subtracted: a bundle-overflow Intercom is
still a physical intercom that needs an entrance, and an overflow Entrance still supplies
one. Annex rows are skipped (`if row.annex`) — without that guard a dependant with four
annexes would count as five placements.

The dependant flag is re-resolved from the **Amenity master**, never read off
`row.is_dependant_amenity` — see [Why the checks read the master](#why-the-checks-read-the-master).

### On the master

`Amenity.validate_dependencies` keeps the graph drawable — none of it was checked before:

| Rule | Error title |
|---|---|
| An amenity may not depend on itself | *Invalid Dependency* |
| A primary may not be listed twice | *Duplicate Primary Amenity* |
| No rings: `A → B → A`, or longer | *Circular Dependency* |

A **disabled** primary warns without blocking — the palette filters `disabled = 0`, so
the dependant becomes undrawable, and only the master knows it. `Amenity.on_trash` names
the dependants rather than letting Frappe's link check say only *"linked with Amenity
Depends On"*.

### While drawing

The Facility Builder shows the same shortfall live, as a persistent chip in the footer
(every layer, never a toast) and a *Needs primary* badge in the palette. It is fed by
`amenity.get_dependency_graph()`, loaded once with the other catalogues. It **never
refuses a placement** — unlike the bundle cap — because drawing more primaries is one of
the two ways to resolve it.

> `action_if_dependencies_missing` is unset on sites installed before it existed; the code
> falls back to `Stop`. `setup.py` seeds it on fresh installs. No patch, per policy.

---

## System core

`validate_system_core(enforce)`: a quotation must carry **at least one** amenity flagged
`Amenity.is_system_core`. The system core is what the rest of the quotation hangs off — a
plan of rooms with no core is not a sellable installation.

It asks only whether a core is **present**, never how many, and never looks at
quantities, floors or price. Applies to **every order type**.

The flag is re-resolved from the **Amenity master**, never read off
`row.is_system_core` — see [Why the checks read the master](#why-the-checks-read-the-master).
No `disabled` filter, for the same reason as Dependencies: an amenity disabled after the
quotation was drawn is still on it.

**An empty `amenities` table warns nothing during `validate`** — that is a draft somebody
has only just opened, not a breach, and warning on every save of it would be noise. At
submit there is no such excuse, and `amenities` is not a `reqd` field, so nothing else
would stop an empty quotation.

The message names the amenities that would satisfy the rule (enabled ones only, capped at
six), so the refusal reads as an instruction rather than a dead end. Where the catalogue
has none flagged at all, it says so instead.

> `system_core_action` is unset on sites installed before it existed; the code falls back
> to `Stop`. `setup.py` seeds it on fresh installs. No patch, per policy.

---

## Why the checks read the master

`validate_dependencies` and `validate_system_core` both re-resolve their flag from the
**Amenity master** rather than reading `row.is_dependant_amenity` / `row.is_system_core`.
Not style — the row's copy is stale at exactly the moment these checks run.

Frappe refreshes a `fetch_from` field inside `_validate_links`, but only under this guard
(`base_document.set_fetch_from_value`), where `self` is the **child row**:

```python
if self.is_new() or not self.docstatus.is_submitted() or _df.allow_on_submit:
```

`submit()` sets `docstatus = 1` and `set_docstatus()` propagates it to the children
**before** `_validate_links()` runs. So on the submit pass the guard is false and the row
keeps whatever the last *draft* save fetched:

| | Amenity master | row's copy |
|---|---|---|
| draft saved | `0` | `0` |
| someone ticks the flag on the Amenity | `1` | `0` |
| **Submit** → `before_submit` | `1` | `0` ← what the row would report |

Reading the row would refuse a quotation that genuinely satisfies the rule.

**This does not make the row's copy pointless.** The same freeze is what makes a submitted
quotation a record of what was true when it was sold — untick the Amenity next year and
the submitted quotation still shows the flag as it stood. Two different questions:

| Question | Source |
|---|---|
| Is this true *now*? (validation) | the Amenity master |
| Was this true *when we sold it*? (record, reporting) | the row's copy |

> An earlier version of this file blamed the Facility Builder for not sending the flag.
> That was wrong: `_validate_links` runs before `run_before_save_methods`, so a row posted
> with only `amenity` on it is fully populated by the time `validate` runs. The freeze at
> submit is the real reason.

---

## When each runs

| Check | `validate` | `before_submit` |
|---|---|---|
| `calculate_totals` (prices) | ✅ | — |
| Row types (`validate_row_types`) | ✅ throws | — |
| Annex price / `bundle_price` discount | ✅ warn/throw per setting | — |
| Unfulfilled composition | ✅ **warn only** | ✅ governed (warn/throw) |
| Undesignated overflow | ✅ warn (names categories) | ✅ governed (warn/throw) |
| Dependencies (`count(D) <= count(P)`) | ✅ **warn only** | ✅ governed (warn/throw) |
| System core present | ✅ **warn only** (skipped while empty) | ✅ governed (warn/throw) |
| `validate_valid_till` | ✅ | — |
