# Field & Function Reference

Quick lookup for the fields and functions the pricing engine touches. `*` = _Planned_.

---

## Butler Quotation (pricing fields)

| Field | Type | Notes |
|---|---|---|
| `order_type` | Select | `Bundle` / `Quotation` / `Amenities` |
| `bundle_type` | Link → Butler Bundle | Bundle orders only |
| `bundle_price` | Currency | flat charge; the header's **Quotation Price*** |
| `default_bundle_price` * | Currency (ro) | bundle's standard price |
| `bundle_currency` | Link → Currency (ro) | from the bundle |
| `bundle_items` | Table → Bundle Item (ro) | composition breakup |
| `amenities` | Table → Butler Quotation Item | the lines |
| `amenity_count` | Int (ro) | number of amenity rows = drawn placements |
| `floor_count` | Int (ro) | distinct floor types |
| `total` | Currency (ro) | bundle: `bundle_price`; amenities: Σ amount |
| `currency` | Link | transaction (document) currency |
| `exchange_rates` | Table → **Currency Exchange Rate** | **editable** `currency → conversion_rate` (rate to company) per currency in play — the single rate source. (The header `conversion_rate` field was removed; the document→company rate is computed from this table's document-currency row.) |
| `apply_discount_on` | Select | `Net Total` / `Grand Total` |
| `discount_mode` | Select | `Percentage` / `Amount` |
| `discount_amount` | Float | the discount value for the chosen mode |
| `net_total` | Currency (ro) | `total − discount share` |
| `total_taxes_and_charges` / `base_total_taxes_and_charges` | Currency (ro) | sum of the `taxes` rows (ERPNext parity) |
| `base_discount_amount` | Currency (ro) | resolved discount in company currency |
| `additional_total` * / `additional_net_total` * | Currency (ro) | extra-amenity charge (+ discount share) |
| `grand_total` / `rounded_total` / `disable_rounded_total` | Currency / Check (ro) | ERPNext rounding |
| `in_words` / `base_in_words` | Data (ro) | written-out `rounded_total`/`base_rounded_total` (or `grand_total`/`base_grand_total` when rounding is disabled) — see [Amount in words](#amount-in-words) below |
| `base_*` | Currency (ro) | company-currency mirrors (`÷ conversion_rate`): `base_total`, `base_net_total`, `base_grand_total`, `base_bundle_price`, `base_additional_*`, … |

## Butler Quotation Item (line)

One table, **two row types** — an amenity row (`annex` empty) and its annex rows. See
[annexes.md](./annexes.md). Every price exists in three tiers, by naming convention:

| Prefix | Currency | `options` |
|---|---|---|
| _(none)_ | the **amenity's** own | `amenity_currency` |
| `qtn_` | the **quotation's** | `currency` |
| `base_` | the **company's** | `Company:company:default_currency` |

**Shared by both row types**

| Field | Type | Notes |
|---|---|---|
| `amenity` | Link → Amenity | reqd |
| `floor_type` | Link → Floor Type | reqd |
| `additional_amenity` | Check (user-set) | this placement is beyond the bundle and is charged on top |
| `amenity_currency` | Link (ro) | `fetch_from` amenity — the amenity's own currency |
| `qtn_exchange_rate` | Float (ro) | amenity → quotation (`base_exchange_rate ÷ document rate`) |
| `base_exchange_rate` | Float (ro) | amenity → company; mirror of its `exchange_rates` row |
| `amenity_category` / `lines` / `image` | (ro) | `fetch_from` amenity |
| `depends_on_floor_count` / `is_dependant_amenity` | Check (ro) | `fetch_from` amenity |

**Amenity row only** — the price ladder is read-only because it is a roll-up

| Field | Type | Notes |
|---|---|---|
| `placement_id` | Data (ro) | the drawn amenity this row belongs to — the Facility Builder's `room.id`, backfilled for rows from anywhere else |
| `annexes_customised` | Check (ro) | this placement's annexes are its own; stops `expand_amenity_rows` re-seeding them |
| `amenity_qty` | Float (ro) | always `1` — one row is one placement |
| `amenity_price` | Currency (ro) | Σ annexes + light + sound + floor, for this placement |
| `qtn_amenity_price` / `qtn_amenity_amount` | Currency (ro) | `× qtn_exchange_rate` |
| `qtn_amenity_net_price` / `qtn_amenity_net_amount` | Currency (ro) | pro-rata share of the header discount |
| `light_system` | Link → Light System | user-set, any system in the master; blank adopts the default and is written back |
| `used_lines` / `total_lines` / `light_system_pricing_mode` | (ro) | copied from `Amenity.light_systems`, or the master when it configures none (then `used_lines = total_lines`) |
| `light_system_price` / `qtn_light_system_price` | Currency | standard / **Quotation Price** |
| `light_system_amount` | Currency (ro) | `±price × used_lines` per the mode |
| `default_system` / `default_system_lines` / `default_system_price` / `default_system_pricing_mode` / `default_system_amount` | (ro) | the default system covering the lines the selection did not, with `qtn_`/`base_` mirrors |
| `has_sound_system` | Check (user-set) | the only "fitted / not fitted" signal |
| `sound_system_price` / `qtn_sound_system_price` | Currency | flat; the Amenity's price, else Butler Settings' default converted to the amenity currency / **Quotation Price** |
| `floor_price` / `qtn_floor_price` | Currency | from `Amenity.floor_extra_price` / **Quotation Price** |
| `quotation_price_changed` | Check (ro) | set by pricing when any of this placement's Quotation Prices differs from its standard; moves no money |
| `floor_qty` | Int (ro) | `floor_count` when floor-dependent, else `0` |
| `floor_amount` | Currency (ro) | `floor_price × floor_qty` |
| `base_*` twins | Currency (ro) | company-currency mirrors |

**Annex row only**

| Field | Type | Notes |
|---|---|---|
| `annex` | Link → Annex | present ⇒ this is an annex row |
| `annex_quantity` | Float | user-set; how many of this annex the placement has |
| `annex_uom` | Link → UOM | user-set; defaults from Annex Price, else the Item |
| `annex_stock_uom` / `conversion_factor` | (ro) | via the Annex's Item; **stock qty only, never the money** |
| `annex_price_list` | Link → Annex Price | which record supplied the standard |
| `annex_price` | Currency (ro) | the standard, amenity currency, per `annex_uom` |
| `qtn_annex_price` | Currency | **Quotation Price**; the only one checked against a standard |
| `qtn_annex_amount` | Currency (ro) | `qtn_annex_price × annex_quantity` |
| `qtn_annex_net_price` / `qtn_annex_net_amount` | Currency (ro) | pro-rata discount share (guidance only) |
| `annex_name` / `annex_category` / `manufacturer` / `warranty` / `warranty_uom` | (ro) | `fetch_from` annex |
| `base_*` twins | Currency (ro) | company-currency mirrors |

## Composition tables

| Doctype | Fields | Where |
|---|---|---|
| **Bundle Item** | `amenity_category`, `amenity_count` | `Butler Quotation.bundle_items` (ro) |
| **Amenity Category Bundle** | `bundle_name` → Butler Bundle, `amenity_count` | `Amenity Category.bundles` (the source of truth) |

## Butler Bundle (master)

| Field | Type | Notes |
|---|---|---|
| `bundle_name` | Data | autoname, unique |
| `bundle_item` | Link → Item | non-stock representative item, locked after save |
| `bundle_price` | Currency | the standard price |
| `currency` | Link → Currency | |
| `max_discount` | Percent | discount floor for `bundle_price` |
| `disabled` | Check | hidden from transactions |

## Amenity (pricing fields)

An amenity has **no flat price** — it is composed from its annexes.

| Field | Type | Notes |
|---|---|---|
| `amenity` | Link → Item | the Item it is sold as (was `amenity_item`); used for Sales Order mapping |
| `currency` | Link → Currency | the currency everything on the amenity is priced in |
| `annexes` | Table → Amenity Annex Item | `annex`, `qty`, `uom`, `rate` — the composition |
| `total` | Currency (ro) | `Σ qty × rate` over `annexes` — **annexes only**, no add-ons |
| `light_systems` | Table → Amenity Light System | `system_name`, `used_lines`, `price`, `pricing_mode` — **alternative** ways to wire the amenity; a quotation line picks one, and the default system fills the lines it leaves |
| `sound_system_price` | Currency | a single flat price; no mode, nothing to choose. `0` falls back to Butler Settings' `sound_system_default_price` |
| `depends_on_floor_count` | Check | enables `floor_extra_price` |
| `floor_extra_price` | Currency | multiplied by the floor count and **added** to the price |
| `lines` | Int | how many lines the amenity has. Each light system's `used_lines` must fit within it **on its own** — they are alternatives, never in use at once, so there is no shared budget to add up |
| `amenity_category` | Link → Amenity Category | |

## Annex Price (per-facility-type pricing)

Replaces the old `Amenity.facility_type_prices`. Keyed **(annex, amenity, facility_type)**;
`facility_type = ""` is the standard price. Written by `Amenity.on_update`
(`upsert_annex_price`), read by `get_annex_price`.

| Field | Type | Notes |
|---|---|---|
| `annex` / `amenity` | Link | reqd — the pair being priced |
| `facility_type` | Link → Facility Type | blank = the standard price |
| `rate` | Currency | in the amenity's currency, per `uom` |
| `uom` | Link → UOM | the unit the rate is quoted in |

## Butler Settings

| Field | Type | Options / Notes |
|---|---|---|
| `maintain_annex_price_action` | Select | `Stop` / `Warn` |
| `role_to_override_annex_price_stop_action` | Link → Role | shown when action = `Stop` |
| `action_if_bundle_items_unfulfilled` | Select | `Stop` / `Warn` |
| `role_to_override_unfulfilled_stop_action` | Link → Role | shown when action = `Stop` |
| `default_valid_till` | Int | default validity days |
| `sound_system_default_price` | Currency (company currency) | charged for a ticked sound system on an Amenity with no `sound_system_price`; converted to the amenity's currency |

---

## Currency & multi-currency

Butler is **granular**: unlike ERPNext's single price-list currency, each amenity and
the bundle carries its own currency. Every price pivots through the company currency
(ERPNext cross-rate, [get_item_details.py:1055](../../../erpnext/erpnext/stock/get_item_details.py)):

```
base_exchange_rate  = amenity_currency → company            (from the exchange_rates table)
qtn_exchange_rate   = base_exchange_rate / document rate    (amenity → quotation)

qtn_<x>             = <x> × qtn_exchange_rate               (quotation currency)
base_<x>            = qtn_<x> × document rate               (company currency)
default_bundle[doc] = bundle_price × bundle_conversion_rate / conversion_rate
```

### The three price tiers, and the Quotation Price

| Tier | Prefix · currency | Fields | Who sets it |
|---|---|---|---|
| **Standard** | none · the amenity's | `annex_price`, `light_system_price`, `sound_system_price`, `floor_price`, `default_bundle_price` | the masters: Annex Price, Amenity, Light System, Butler Settings, Butler Bundle. Read-only |
| **Quotation Price** | `qtn_` · the quotation's | `qtn_annex_price`, `qtn_light_system_price`, `qtn_sound_system_price`, `qtn_floor_price`, and the header's `bundle_price` | the user, **on the quotation only**. The Facility Builder never sets one |
| **Company** | `base_` · the company's | every `base_*` | derived. Read-only |

Every other quotation-currency field (`qtn_annex_amount`, `qtn_amenity_price`, the net
prices, the default-system fill, the totals) is **calculated** and read-only. Those five
are the only prices a user can change.

**A Quotation Price follows its standard until the user changes it.** While it still equals
the standard at the rate that produced it, each recalculation re-derives it, so a currency
change, a new exchange rate or a different light system moves it. Once the user types a
different figure it is a **changed Quotation Price** and is kept: across recalculations,
currency changes, and Facility Builder saves (`carry_forward_overrides`). `price_annex_row`
and `track_add_on_price` make that decision. Each amenity row records whether any of its
Quotation Prices has changed in the read-only `quotation_price_changed`, which the line
editor filters on.

Two things set the annex Quotation Price apart from the other three:

- **It is the only one checked.** It has a published standard per facility type (Annex
  Price), so a change is governed by `maintain_annex_price_action`. See
  [validations.md](./validations.md#annex-price--maintain_annex_price_action). The light
  system, sound system and floor prices can be changed freely.
- **It is converted back.** A changed annex Quotation Price is divided back into
  `annex_price`, so the amenity-currency roll-up uses it. The add-ons keep their standard
  in the amenity-currency field and are charged from the Quotation Price directly.
  Everything above the annex derives upward in amenity currency and is projected out to
  `qtn_` and `base_`. A calculated `qtn_` value is never converted back down.

**The `exchange_rates` table is the single editable source of rates.** `sync_exchange_rates`
maintains one row per **distinct** non-company currency on the quotation (the document
currency, every amenity's currency, the bundle's currency) → its rate to the company
currency:

| Field | Role |
|---|---|
| `exchange_rates` (table → **Currency Exchange Rate**) | one **editable** `currency → conversion_rate` row per currency in play; `currency` is read-only, the rate is the override point |
| document→company rate | **computed local** (the `conversion_rate` field was removed) = the table's row for the document `currency` |
| bundle→company rate | **computed local** (the `bundle_conversion_rate` field was removed) = the table's row for `bundle_currency` |
| `exchange_rate` (ro, per line) | the only stored mirror — that amenity's `amenity_currency` row, kept on the line for the `base_*` calc |

The per-source rate fields are **read-only mirrors** of the table, so the same currency
always carries **one** rate everywhere — no per-line drift. New rows are auto-fetched
from **Currency Exchange** as of `transaction_date`
(`get_exchange_rate(..., "for_selling")`, = 1 when currencies match); a user-entered
rate is preserved on recompute, and rows for currencies no longer used are dropped. The
table shows whenever it has rows; the company-currency `base_*` fields show in
multi-currency.

**Missing rates aren't silently 1.** When no Currency Exchange record exists, the row is
left at **0** (not defaulted to 1), so it's visible and editable; `validate_exchange_rates`
then **warns on save and blocks on submit** (mirroring ERPNext's `validate_conversion_rate`)
until you enter the rate — otherwise prices in that currency would stay unconverted. This
fixes the case of an amenity/bundle currency (e.g. EUR) with no rate to the company
currency, regardless of the quotation currency.

**Display (ERPNext parity)** — `butler_quotation.js` `toggle_currency_fields` mirrors
`transaction.js` `change_form_labels` / `toggle_item_grid_columns`:

- Every **(Company Currency)** `base_*` field (header + grid) is **shown only when some
  currency in play differs from the company currency** — the quotation `currency`, the
  `bundle_currency`, **or any amenity's `amenity_currency`** (`is_multi_currency`). When
  all are equal there's nothing to convert, so they stay hidden. Collapsed grid **columns**
  via ERPNext's `set_column_disp`; the **expanded amenity row form** via `form_render`,
  because Frappe caches a per-row docfield copy (`get_docfield_copy`) that `set_column_disp`
  can't reach — so the open row form is hidden by manipulating its controls directly. They're **read-only**
  (computed). All rate editing happens in the **`exchange_rates` table** (the only
  editable rate source); the document and bundle rates are computed locals and the
  per-line `exchange_rate` mirror is read-only, so a currency can't carry different
  rates across rows.
- **Currency codes in labels** (ERPNext `set_currency_labels`): every Currency field's
  label gets the real code — `options: currency` fields → the document currency
  (e.g. **Total (USD)**), `options: Company:company:default_currency` fields → the
  company currency (e.g. **Total (SAR)**, replacing the literal "(Company Currency)").
  Header + amenities/taxes grids; via `set_currency_field_labels`.
- `net_total` / `additional_net_total` are **shown only when a document discount
  applies** (otherwise they equal `total` / `additional_total` — redundant); their
  `base_*` twins show only when discounted **and** multi-currency.

## Amount in words

`in_words`/`base_in_words` are set by `ButlerQuotation.set_total_in_words()`, called at
the end of `calculate_totals()` — same trigger points as ERPNext's own
`set_total_in_words` (off `rounded_total`/`base_rounded_total`, or the unrounded
`grand_total`/`base_grand_total` when `disable_rounded_total` is set).

Butler uses its **own** formatter, `butler.utils.currency.format_currency_in_words` —
deliberately **not** ERPNext's `frappe.utils.money_in_words` — mirroring the same
function already used in the sibling `erp_contract` app (duplicated, not cross-imported,
so Butler's only hard dependency stays `erpnext`). Both build on the same low-level
primitive, `frappe.utils.data.in_words` (which wraps `num2words`), but differ in the
wrapping:

| | ERPNext `money_in_words` | Butler `format_currency_in_words` |
|---|---|---|
| Fraction length | dynamic, from `Currency.fraction_units` (handles 3-decimal currencies) | fixed 2 decimals |
| Numbering system | `en_IN` (lakh/crore) when the currency's number format is Indian-grouped, else `frappe.local.lang` | always `frappe.local.lang` (no lakh/crore fallback) |
| Currency name | the raw currency **code** (`self.currency`, e.g. `SAR`) wrapped in `_()` | `Currency.currency_name` (e.g. "Saudi Riyal") — reads correctly without a translation entry |
| Word order | currency first: `"SAR One Thousand and Fifty Halala"` | number first, cheque-writing style: `"One Thousand Saudi Riyal and Fifty Halala only."` |
| `DZD` special-case | yes (Algerian Dinars) | no |
| Callable from client | no (server-only, internal to `set_total_in_words`) | yes (`@frappe.whitelist()`) |

## Whitelisted / shared functions

| Function | Location | Purpose |
|---|---|---|
| `get_amenity_pricing(amenity, facility_type)` | `butler_quotation.py` | resolve an amenity's standard price (server + client) |
| `get_bundle_breakdown(bundle)` | `butler_bundle.py` | a bundle's per-category allowance (quotation + Facility Builder) |
| `apply_governance_action(action, *, message, title, override_role)` | `butler_quotation.py` | Stop/Warn + override-role enforcement |
| `format_currency_in_words(amount, currency)` | `butler/utils/currency.py` | written-out amount, Butler's own convention (see above) |
