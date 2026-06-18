# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import frappe


def after_install():
    setup_butler_settings()


def setup_butler_settings():
    """Seed default values on the Butler Settings single doctype.

    Field-level `default`s only apply when the Single is first opened, so we set them
    explicitly on install. Idempotent: only fills values that aren't already set, so it
    never clobbers a configured site (safe to also call from after_migrate / a patch).
    """
    defaults = {
        "disable_amenity_consolidation": 0,
        "maintain_standard_price_action": "Stop",
    }

    settings = frappe.get_single("Butler Settings")
    changed = False
    for fieldname, value in defaults.items():
        if not settings.get(fieldname):
            settings.set(fieldname, value)
            changed = True

    if changed:
        settings.save(ignore_permissions=True)
        frappe.db.commit()
