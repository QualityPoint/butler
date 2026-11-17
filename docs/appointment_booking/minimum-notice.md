# Minimum notice

The booking page offers a slot only while it starts at least **Minimum Notice (Hours)** from
now. With the default of 2, a 13:00 slot is open until 11:00:00 and closed from 11:00:01.

| | |
|---|---|
| Setting | Appointment Booking Settings → **Minimum Notice (Hours)** (`minimum_notice_hours`, a Butler custom field beside "Advance Booking Days"); 0 only closes past slots |
| Rule | `is_bookable` in `butler/appointment_booking/notice.py`: `slot start − now ≥ notice`, both in the site's timezone (System Settings) |
| On the page | `get_appointment_slots` marks a slot inside the notice unavailable, so it shows as closed |
| On booking | `create_appointment` calls `validate_notice` and refuses a late slot ("Appointments must be booked at least 2 hours in advance."), so a page left open past the cut-off cannot book it |
| Not limited | Appointments created in the desk |

Existing sites get the value 2 from the patch `set_appointment_minimum_notice`; a missing
value would read as 0.

Tests: `butler/tests/test_appointment_notice.py`.
