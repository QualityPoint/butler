import frappe

# Self-contained on purpose: a patch runs once per site, so it must not change meaning when
# `butler.custom.fixtures` is edited later. Patches also run before after_migrate seeds the
# fixtures, so the light system devices are created here rather than assumed to exist.
LIGHT_SYSTEM_DEVICES = {
	"Relay": {
		"light_system_device_name": "Relay Actuator 12CH",
		"description": "12-channel switching actuator for on/off lighting circuits.",
		"warranty": 2,
		"warranty_uom": "Years",
		"channels_count": 12,
	},
	"Dimmer": {
		"light_system_device_name": "Universal Dimmer 4CH",
		"description": "4-channel universal dimming actuator for leading/trailing edge loads.",
		"warranty": 2,
		"warranty_uom": "Years",
		"channels_count": 4,
	},
	"DALI": {
		"light_system_device_name": "DALI Gateway 64",
		"description": "DALI gateway driving one DALI line of up to 64 addressable ballasts.",
		"warranty": 2,
		"warranty_uom": "Years",
		"channels_count": 64,
	},
}


def execute():
	"""Fit each standard Light System with its light system device.

	Idempotent: a light system device that already exists is reused, a system that already
	lists it is left alone, and an existing default is never displaced — the new row is only
	the default when the system had none at all (`LightSystem.validate_light_system_devices`).
	A system missing on this site, renamed or deleted, is reported and skipped.
	"""
	for system, spec in LIGHT_SYSTEM_DEVICES.items():
		spec = spec.copy()
		channels_count = spec.pop("channels_count")
		light_system_device = ensure_light_system_device(spec)

		if not frappe.db.exists("Light System", system):
			print(f"Light System {system!r} not found, skipped adding {light_system_device!r}")
			continue

		doc = frappe.get_doc("Light System", system)
		if any(row.light_system_device == light_system_device for row in doc.light_system_devices):
			continue

		doc.append(
			"light_system_devices",
			{"light_system_device": light_system_device, "channels_count": channels_count},
		)
		doc.save(ignore_permissions=True)


def ensure_light_system_device(spec):
	if not frappe.db.exists("Light System Device", spec["light_system_device_name"]):
		frappe.get_doc({"doctype": "Light System Device", **spec}).insert(ignore_permissions=True)
	return spec["light_system_device_name"]
