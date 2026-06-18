import frappe

def get_context(context):
    context.year = frappe.utils.now_datetime().year

    # Check if user is logged in
    user = frappe.session.user
    context.is_logged_in = user != "Guest"

    if context.is_logged_in:
        user_doc = frappe.get_doc("User", user)
        # note: the field in User is named 'user_image'
        context.user_image_url = user_doc.get("user_image") or None