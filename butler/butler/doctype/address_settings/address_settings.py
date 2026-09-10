# Copyright (c) 2026, QualityPoint and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from butler.utils.location.map_location import geocode


class AddressSettings(Document):
    pass


@frappe.whitelist(allow_guest=False)
def get_map_defaults():
    """Return the configured default map center and zoom from Address Settings."""
    settings = frappe.get_single("Address Settings")
    lat = settings.default_map_latitude
    lng = settings.default_map_longitude
    zoom = settings.default_map_zoom or 10

    if lat is not None and lng is not None:
        return {"center": [lat, lng], "zoom": zoom}
    return None


@frappe.whitelist(allow_guest=False)
def fetch_country_coordinates():
    """Look up the centre coordinates of the system's default country via Nominatim.

    Delegates to `butler.utils.location.map_location.geocode`, the app's single
    Nominatim caller, keeping this lookup's own structured `country=` query rather
    than free text. Behaviour is unchanged — same endpoint, same User-Agent, same
    timeout — but the two callers can no longer drift apart, and this one now gets
    the shared 24-hour cache.
    """
    country = frappe.db.get_single_value("System Settings", "country")
    if not country:
        frappe.throw(_("No default country is set in System Settings."),
                     title=_("Country Not Configured"))

    hit = geocode(country=country)
    if not hit:
        frappe.throw(
            _("Could not find coordinates for country '{0}'.").format(country),
            title=_("Country Not Found"),
        )

    return {
        "country": country,
        "latitude": hit["latitude"],
        "longitude": hit["longitude"],
    }
