# Verify page

`/book_appointment/verify?key=…` is the link in ERPNext's "Appointment Confirmation" email.
Butler's page (`butler/www/book_appointment/verify/`) replaces ERPNext's at that path, keeps
ERPNext's verification and draws the result in Butler's style.

| | |
|---|---|
| Who decides | ERPNext: `get_context` in `erpnext.www.book_appointment.verify.index`, called as is. It checks the link, its expiry and the appointment, opens it, and sets `success` and `message` |
| What Butler adds | The slot (day, date, time range, timezone) from `slot_for_link` in `butler/appointment_booking/verification.py`, in the site's timezone and the visitor's language |
| Layout | `full_width`, the shared Butler panel (below), and the page's own card styles |

## What the visitor sees

| ERPNext result | Heading | Card |
|---|---|---|
| `success`, no message | "Appointment confirmed" | the slot, "Your appointment is confirmed…", **Back to Butler** (`/`) |
| `success`, a message | "Already confirmed" | the slot, ERPNext's message, **Back to Butler** |
| no `success` | "Not confirmed" | ERPNext's message (expired, invalid, closed, time passed, slot taken), **Book again** (`/book_appointment`) |

Every card ends with the help line and the phone number 9200 12 8 13 (`tel:` link).

## Shared Butler panel

The login page (`www/login.html`) and this page share one look:

| File | Holds |
|---|---|
| `public/css/butler_panel.bundle.css` | Colours, paper background, nav bar, logo, heading, card, buttons, the result card of the verify and thanks pages; the nav moves above the card under 768px. A bundle: `bench build` gives it a hashed URL, so a deploy never leaves browsers on a stale copy |
| `templates/includes/butler_panel_macros.html` | `phone_link()`, the help number |
| `templates/includes/butler_panel_head.html` | Icon, fonts (Anton, Courier Prime, Noto Kufi Arabic) and the stylesheet |
| `templates/includes/butler_nav.html` | The top nav bar |

## Setting it relies on

ERPNext's links expire after Appointment Booking Settings → **Verification Link Expiry
Duration** minutes (15 to 60, default 30). A site whose settings were saved before that field
existed has no value, which ERPNext reads as 0, so every link has expired by the time it is
opened. The patch `set_verification_link_expiry` stores 30 on such sites.

Tests: `butler/tests/test_appointment_verification.py`.
