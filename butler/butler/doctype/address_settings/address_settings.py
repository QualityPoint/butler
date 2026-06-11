# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import frappe
import requests
from frappe import _
from frappe.model.document import Document


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
    """Look up the centre coordinates of the system's default country via Nominatim."""
    country = frappe.db.get_single_value("System Settings", "country")
    if not country:
        frappe.throw(_("No default country is set in System Settings."),
                     title=_("Country Not Configured"))

    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"country": country, "format": "json", "limit": 1},
            headers={"User-Agent": "Butler/1.0"},
            timeout=10,
        )
        response.raise_for_status()
        results = response.json()
    except Exception as e:
        frappe.throw(_("Failed to fetch coordinates: {0}").format(
            str(e)), title=_("Geocoding Error"))

    if not results:
        frappe.throw(
            _("Could not find coordinates for country '{0}'.").format(country),
            title=_("Country Not Found"),
        )

    return {
        "country": country,
        "latitude": float(results[0]["lat"]),
        "longitude": float(results[0]["lon"]),
    }
