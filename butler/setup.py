import frappe

from butler.custom.custom_fields import delete_custom_fields, make_custom_fields
from butler.custom.fixtures import make_fixtures
from butler.custom.property_setter import create_property_setter, remove_property_setter


def after_install():
    # create_property_setter() # TODO: Uncomment this line if property setters need to be created on install
    make_custom_fields()
    make_fixtures()
    setup_butler_settings()


def before_uninstall():
    # remove_property_setter() # TODO: Uncomment this line if property setters need to be removed on uninstall
    delete_custom_fields()


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
