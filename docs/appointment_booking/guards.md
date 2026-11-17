# Guards on the booking endpoints

The booking page's server calls are open to guests, so `butler/www/book_appointment/index.py`
limits and checks them. The limits are ERPNext's own (`erpnext/www/book_appointment/index.py`).

| Endpoint | Guard |
|---|---|
| `create_appointment` | POST only; 5 bookings per 5 minutes per visitor IP (`rate_limit`) |
| `get_appointment_slots` | 60 requests per minute per visitor IP |
| Both | The timezone and date are checked with ERPNext's `validate_timezone` and `parse_datetime`, and converted with its `convert_to_system_timezone` / `convert_to_guest_timezone` |
| `create_appointment` | The contact must be a JSON object (`parse_contact`), else "Please fill in your contact details." |

A visitor over a limit gets Frappe's "too many requests" message (HTTP 429); bad input gets
the message above (HTTP 417), never a server error. The limiter counts in Redis by IP, and only
inside a web request: tests and the console are not limited.

Tests: `butler/tests/test_book_appointment_page.py`.
