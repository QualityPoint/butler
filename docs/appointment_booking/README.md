# Appointment booking

Butler's public booking page, `/book_appointment` (`butler/www/book_appointment/`), replaces
ERPNext's page of the same path on a site with Butler installed. A booking made there is
confirmed at once: a Lead is created for the email, and ERPNext's Appointment assigns an
agent and adds a calendar event.

| File | Covers |
|---|---|
| [minimum-notice.md](./minimum-notice.md) | Slots close a set number of hours before they start |
| [slot-capacity.md](./slot-capacity.md) | How many bookings a slot takes: one per agent, as ERPNext decides |
| [holidays.md](./holidays.md) | Holiday slots close by the business date, full days only, as the server checks |
| [guards.md](./guards.md) | Rate limits, POST-only booking and input checks on the page's server calls |
| [verify-page.md](./verify-page.md) | The page ERPNext's confirmation email links to, in Butler's style; the shared Butler panel |
