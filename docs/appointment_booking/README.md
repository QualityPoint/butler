# Appointment booking

Butler's public booking page, `/book_appointment` (`butler/www/book_appointment/`), replaces
ERPNext's page of the same path on a site with Butler installed. A booking made there is
confirmed at once: a Lead is created for the email, and ERPNext's Appointment assigns an
agent and adds a calendar event.

| File | Covers |
|---|---|
| [minimum-notice.md](./minimum-notice.md) | Slots close a set number of hours before they start |
