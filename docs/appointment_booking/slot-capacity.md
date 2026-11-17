# Slot capacity

A slot holds as many appointments as there are agents. Butler's booking page and ERPNext
apply the same rule, with ERPNext's code.

| | |
|---|---|
| Capacity | Appointment Booking Settings → "Number of Concurrent Appointments" (`number_of_agents`), read-only: ERPNext sets it to the number of rows in **Agents** on every save (`AppointmentBookingSettings.validate`) |
| What counts | Open appointments whose start lies within one appointment duration of the slot; Closed and Unverified ones do not (`get_booked_slot_times`, ERPNext) |
| On the page | `get_appointment_slots` offers a slot while `is_slot_available` (ERPNext, `erpnext/www/book_appointment/index.py`) finds fewer bookings than agents; the day's bookings are read once with `get_booked_slot_times_for` |
| On save | ERPNext refuses one more with "Time slot is not available" (`Appointment.validate_available_time_slot`), for desk and page bookings alike |
| Who takes it | ERPNext assigns a free agent: the one on the customer's latest Opportunity, else the least booked that day (`Appointment.auto_assign`) |

With 4 agents, the 4th booking of an hour closes that slot on the page; closing an
appointment opens it again. To change the capacity, change the Agents list.

Tests: `TestSlotCapacity` in `butler/tests/test_book_appointment_page.py`.
