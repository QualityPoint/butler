# Field & Function Reference

Quick lookup for the fields and functions the pricing engine touches. `*` = _Planned_.

---

## Butler Quotation (pricing fields)

| Field | Type | Notes |
|---|---|---|
| `order_type` | Select | `Bundle` / `Quotation` / `Amenities` |
| `bundle_type` | Link → Butler Bundle | Bundle orders only |
| `bundle_price` | Currency | flat charge; editable* |
| `default_bundle_price` * | Currency (ro) | bundle's standard price |
| `bundle_currency` | Link → Currency (ro) | from the bundle |
| `bundle_items` | Table → Bundle Item (ro) | composition breakup |
| `amenities` | Table → Butler Quotation Item | the lines |
| `amenity_count` | Int (ro) | Σ qty |
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
| `base_*` | Currency (ro) | company-currency mirrors (`÷ conversion_rate`): `base_total`, `base_net_total`, `base_grand_total`, `base_bundle_price`, `base_additional_*`, … |

## Butler Quotation Item (line)

| Field | Type | Notes |
|---|---|---|
| `amenity` | Link → Amenity | reqd |
| `floor_type` | Link → Floor Type | reqd |
| `amenity_category` | Link (ro) | `fetch_from` amenity |
| `qty` | Int | |
| `amenity_currency` | Link (ro) | `fetch_from` amenity — the amenity's own currency |
| `exchange_rate` | Float (ro) | `amenity_currency`→company; mirror of its `exchange_rates` row (so the same currency never drifts per line) |
| `amenity_price` | Currency (ro) | the amenity's standard price **in its own currency** (`amenity_currency`) — e.g. 100 EUR |
| `standard_rate` | Currency (ro, hidden) | `amenity_price` converted to **document** currency (`× exchange_rate / conversion_rate`); the reference for rate-default & deviation |
| `rate` | Currency | defaults to `standard_rate`; document currency; user-overridable |
| `amount` | Currency (ro) | `floors × rate × qty` |
| `net_rate` / `net_amount` | Currency (ro) | after the document discount (ERPNext parity) |
| `base_amenity_price` | Currency (ro) | `amenity_price × exchange_rate` (amenity currency → company) |
| `base_rate` / `base_net_rate` / `base_amount` / `base_net_amount` | Currency (ro) | company-currency mirrors (`× conversion_rate`) |
| `additional_amenity` * | Check (user-set) | designates an extra/overflow row to charge |
| `depends_on_floor_count` / `is_dependant_amenity` / `has_changeable_price` | Check (ro) | `fetch_from` amenity |

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

| Field | Type | Notes |
|---|---|---|
| `standard_price` | Currency | base price |
| `has_changeable_price` | Check | enables `facility_type_prices` |
| `facility_type_prices` | Table | per-facility-type price overrides |
| `depends_on_floor_count` | Check | price scales by distinct floor count |
| `amenity_category` | Link → Amenity Category | |
| `amenity_item` | Link → Item | for Sales Order mapping |

## Butler Settings

| Field | Type | Options / Notes |
|---|---|---|
| `maintain_standard_price_action` | Select | `Stop` / `Warn` |
| `role_to_override_standard_price_stop_action` | Link → Role | shown when action = `Stop` |
| `action_if_bundle_items_unfulfilled` | Select | `Stop` / `Warn` |
| `role_to_override_unfulfilled_stop_action` | Link → Role | shown when action = `Stop` |
| `disable_amenity_consolidation` | Check | skip merging duplicate lines |
| `default_valid_till` | Int | default validity days |

---

## Currency & multi-currency

Butler is **granular**: unlike ERPNext's single price-list currency, each amenity and
the bundle carries its own currency. Every price pivots through the company currency
(ERPNext cross-rate, [get_item_details.py:1055](../../../erpnext/erpnext/stock/get_item_details.py)):

```
standard_rate[doc]  = amenity_price  × exchange_rate            / conversion_rate
default_bundle[doc] = bundle_price   × bundle_conversion_rate  / conversion_rate
base_<x>            = <x>[doc] × conversion_rate               (company currency)
```

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

## Whitelisted / shared functions

| Function | Location | Purpose |
|---|---|---|
| `get_amenity_pricing(amenity, facility_type)` | `butler_quotation.py` | resolve an amenity's standard price (server + client) |
| `get_bundle_breakdown(bundle)` | `butler_bundle.py` | a bundle's per-category allowance (quotation + Facility Builder) |
| `apply_governance_action(action, *, message, title, override_role)` | `butler_quotation.py` | Stop/Warn + override-role enforcement |
