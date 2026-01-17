import frappe
from frappe.config import get_modules_from_all_apps_for_user


def has_app_permission():
    """
    Check if the current user has permission to access the Butler app.
    """
    if frappe.session.user == "Administrator":
        return True

    allowed_modules = get_modules_from_all_apps_for_user()
    allowed_modules = [x["module_name"] for x in allowed_modules]

    # Check if user has access to Butler module
    if "Butler" not in allowed_modules:
        return False

    # Check for specific roles
    roles = frappe.get_roles()
    if any(role in ["System Manager", "Butler User"] for role in roles):
        return True

    return False
