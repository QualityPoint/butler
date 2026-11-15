# Pricing a device row

```
device_price_list = get_device_price(device, amenity, facility_type)
    → the Device Price for this facility type, else the standard one (facility_type = "")

device_price  = Device Price.rate          # amenity currency, per device_uom
device_amount = device_price × device_quantity
```

`Device Price` replaced the old `Amenity.facility_type_prices`. The override now lives
**per device** rather than per amenity, and the mere existence of a facility-type row is
what makes a price changeable — there is no `has_changeable_price` gate any more. The
facility type comes from the quotation's `facility_type` (fetched from its Facility).

## UOM

`device_uom` defaults to the Device Price's uom, else the device's Item `sales_uom` /
`stock_uom` (`get_device_default_uom`). `device_stock_uom` and `conversion_factor` are
resolved through the Device's Item with ERPNext's own `get_conversion_factor`, so Butler
follows the same UOM Conversion Detail rules as a Sales Order line.

> **`conversion_factor` never touches the money.** The rate is quoted *per `device_uom`*;
> the factor exists only to derive a stock quantity downstream. Applying it to the amount
> as well would double-count it.
