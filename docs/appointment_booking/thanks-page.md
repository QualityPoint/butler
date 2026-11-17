# Thanks page

`/thanks` (`butler/www/thanks/`) is where a customer lands after booking: the success page named
in Appointment Booking Settings → **Success Redirect URL** ("thanks"). It uses the shared Butler
panel (see [verify-page.md](./verify-page.md#shared-butler-panel)).

## How the booking reaches it

```
Submit ─▶ create_appointment ─▶ booking_summary ─▶ sessionStorage "butler_booking" ─▶ /thanks
          (www/book_appointment)  (appointment_booking/display.py)   (this tab only)
```

| Step | What happens |
|---|---|
| `create_appointment` | Returns `booking_summary(appointment)`: reference, the name the customer typed, the slot (day, date, time range, timezone) and **Booked on** (the Appointment's `creation`), in the visitor's language. Never the whole record |
| Booking page | Stores that reply in the tab's `sessionStorage` and opens the success page at once (`success_page_url`, ERPNext's rule: `/{success_redirect_url}`, else `/book_appointment`) |
| `/thanks` | Its inline script reads the tab's copy and fills the booked card as text, never HTML |

Nothing personal is put in the URL, and the page shows nothing to a visitor who did not just
book in that tab.

## What the visitor sees

| Tab holds a booking | Heading | Card |
|---|---|---|
| yes | "Appointment booked" | the slot, booking reference, Booked on, "Thank you, {name}…", **Back to Butler**, *Book another appointment* |
| no | "Thank you" | "Thank you for booking with Butler.", **Back to Butler**, *Book an appointment* |

No email is promised: a Butler booking is confirmed at once and gets no confirmation email.

Tests: `TestBookingSummary` in `butler/tests/test_appointment_verification.py`.
