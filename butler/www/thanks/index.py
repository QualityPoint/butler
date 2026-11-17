no_cache = 1


def get_context(context):
	"""The success page after booking an appointment; the booking itself comes from the tab's
	sessionStorage, written by the booking page (www/book_appointment/index.js)."""
	context.full_width = 1  # the panel's background spans the page, as on the login page
	return context
