import frappe
from erpnext.www.book_appointment.verify.index import get_context as verify_with_erpnext

from butler.appointment_booking.verification import slot_for_link

no_cache = 1


def get_context(context):
	"""ERPNext verifies the link and sets `success` and `message`; Butler adds the slot to show."""
	verify_with_erpnext(context)
	context.full_width = 1  # the panel's background spans the page, as on the login page
	context.slot = slot_for_link(frappe.form_dict.get("key")) if context.success else None
	return context
