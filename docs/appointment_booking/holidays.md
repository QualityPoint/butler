# Holidays

The booking page closes the slots of a holiday with the same check the server uses when an
appointment is saved: ERPNext's `is_holiday(holiday_list, date)`
(`erpnext/setup/doctype/holiday_list/holiday_list.py`), called from `get_appointment_slots`.

| | |
|---|---|
| Which list | Appointment Booking Settings → **Holiday List** |
| Which date | The slot's date in the site's timezone (System Settings), not the visitor's: a holiday is a business date. A visitor many hours ahead still sees the holiday's slots closed |
| Half days | Not closed: a half-day holiday still takes appointments, as `Appointment.validate_holiday` allows them |

The list must hold the current year's dates; a list for a past year closes nothing.

Tests: `TestHolidayIsABusinessDate` in `butler/tests/test_book_appointment_page.py`.
