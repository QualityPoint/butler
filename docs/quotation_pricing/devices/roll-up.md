# Rolling up

```
amenity_price      = Σ device_amount + light_system_amount
                       + sound_system_amount + floor_amount      # amenity currency
qtn_amenity_price  = amenity_price × qtn_exchange_rate           # quotation currency
qtn_amenity_amount = qtn_amenity_price × amenity_qty             # amenity_qty is 1
```

`amenity_qty` is kept at `1` and the multiplication left in place, so the arithmetic still
adds up if a row ever carries another quantity.

Header totals then follow [amenities.md](../amenities.md#step-3--header-totals).
