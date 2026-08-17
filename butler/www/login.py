# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

from frappe.www.login import get_context as frappe_login_context

no_cache = True


def get_context(context):
    """Reuse Frappe's core login context so every provider, setting and flag
    (username/password, social login, LDAP, signup, email-link, Frappe Cloud
    login, 2FA, etc.) keeps working. Butler's login.html only re-skins the page.
    """
    frappe_login_context(context)
    # render edge-to-edge: web.html only wraps page_content in a centered
    # .container when full_width is falsy, which was boxing the background image.
    context.full_width = 1
    return context
