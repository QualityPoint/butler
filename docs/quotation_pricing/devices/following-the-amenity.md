# When an Amenity's device list changes

A non-customised amenity **follows its Amenity**, on every save: a device added to the Amenity
appears (at its standard price), and one removed from it drops out. A changed Quotation Price
on a device that stays is kept (`carry_forward_overrides`). This is what a Facility Builder
save always did; a form save, Reset Amenity and the API now do it too.

Removing a device from an Amenity also deletes its Device Prices
(`Amenity.remove_stale_device_prices`). A quotation row may still point at one of them
(`device_price_list`). That link is cleared before Frappe's link check
(`ButlerQuotation._validate_links`), and pricing re-resolves it, so the save does not fail
with "Could not find … Device Price List".

A **customised** amenity keeps its own list. If it still holds a device its Amenity no longer
has, that device becomes an [extra device](./extra-devices.md): its Device Price is gone, so the price
it had is kept as a changed Quotation Price. *Reset Amenity → Devices* puts the placement back
on the Amenity's list.

**Once, on deploy:** the `sync_quotations_with_amenities` patch (after
`convert_legacy_quotations`) saves every draft that is behind its Amenities, or links a
deleted Device Price, and adds a timeline note "Synced with the Amenities' current device lists"
with the old → new total. So no total jumps unexplained the next time someone saves. The
device-price check is skipped for that system save (`flags.ignore_price_governance`), so a price
someone deliberately changed earlier does not stop it. A draft that fails is rolled back alone
and logged.

> On butler.local, `BTLR-QTN-2026-00030` (last saved 2026-09-16) was the case that showed
> this. AC had since been removed from Garage and Motion Sensor from Balcony, and light lines
> and other devices had been added to most Amenities. It was synced with Reset Amenity →
> Devices: 225,240.15 → 298,619.35, recorded in its timeline.
