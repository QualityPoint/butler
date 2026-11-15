import json
import re

import frappe

from butler.patches.v1_0.rename_annex_to_device import COLUMNS, DOCTYPES, SETTINGS

FIELDNAMES = {old: new for renames in (*COLUMNS.values(), SETTINGS) for old, new in renames.items()} | {
	"annexes": "devices",
	"is_annex": "is_device",
}
FIELDNAME = re.compile(r"\b(" + "|".join(sorted(FIELDNAMES, key=len, reverse=True)) + r")\b")
DOCTYPE_NAME = re.compile(r"""(['"])(""" + "|".join(sorted(DOCTYPES, key=len, reverse=True)) + r")\1")
JINJA_TAG = re.compile(r"{{.*?}}|{%.*?%}", re.DOTALL)


def execute():
	"""Point site print formats and Facility Builder drawings at the Device names.

	Runs before the patches that read drawings; only known DocType and field names change,
	so a print format's visible text and any record names in it stay as the site wrote them.
	"""
	for pf in frappe.get_all(
		"Print Format",
		filters={"standard": "No"},
		or_filters={"html": ["like", "%annex%"], "format_data": ["like", "%annex%"]},
		fields=["name", "html", "format_data"],
	):
		values = {}
		if pf.html:
			values["html"] = rename_in_jinja(pf.html)
		if pf.format_data:
			values["format_data"] = json.dumps(rename_in_layout(json.loads(pf.format_data)))
		frappe.db.set_value("Print Format", pf.name, values, update_modified=False)
		frappe.logger("butler").info(f"Print Format {pf.name}: annex names renamed to device")

	if frappe.db.has_column("Butler Quotation", "geometry"):
		for name, geometry in frappe.get_all(
			"Butler Quotation",
			filters={"geometry": ["like", "%annex%"]},
			fields=["name", "geometry"],
			as_list=True,
		):
			drawing = json.loads(geometry)
			if rename_drawing(drawing):
				frappe.db.set_value(
					"Butler Quotation", name, "geometry", json.dumps(drawing), update_modified=False
				)

	log_scripts_still_naming_annex()


def rename_names(code: str) -> str:
	code = DOCTYPE_NAME.sub(lambda m: m.group(1) + DOCTYPES[m.group(2)] + m.group(1), code)
	return FIELDNAME.sub(lambda m: FIELDNAMES[m.group(1)], code)


def rename_in_jinja(html: str) -> str:
	"""Rename the old DocType and field names inside `{{ }}` and `{% %}` only."""
	return JINJA_TAG.sub(lambda tag: rename_names(tag.group(0)), html)


def rename_in_layout(layout):
	"""A Print Format Builder layout: rename `fieldname` values, and the Jinja of its HTML."""
	if isinstance(layout, list):
		return [rename_in_layout(item) for item in layout]
	if not isinstance(layout, dict):
		return layout
	renamed = {}
	for key, value in layout.items():
		if key == "fieldname" and isinstance(value, str):
			renamed[key] = FIELDNAMES.get(value, value)
		elif key in ("options", "html") and isinstance(value, str):
			renamed[key] = rename_in_jinja(value)
		else:
			renamed[key] = rename_in_layout(value)
	return renamed


def rename_drawing(drawing: dict) -> bool:
	"""A room's edited composition `annexes: [{annex, ...}]` becomes `devices: [{device, ...}]`.

	Returns whether anything changed.
	"""
	changed = False
	for floor in drawing.get("floors") or []:
		for room in floor.get("rooms") or []:
			if "annexes" not in room:
				continue
			room["devices"] = [
				{("device" if key == "annex" else key): value for key, value in entry.items()}
				for entry in room.pop("annexes") or []
			]
			changed = True
	return changed


def log_scripts_still_naming_annex():
	"""Site scripts and reports are code someone wrote on the site: list them, never edit them."""
	checks = {
		"Client Script": "script",
		"Server Script": "script",
		"Report": "query",
		"Notification": "message",
	}
	found = [
		f"{doctype} {name}"
		for doctype, field in checks.items()
		for name in frappe.get_all(doctype, filters={field: ["like", "%annex%"]}, pluck="name")
	]
	if found:
		frappe.log_error(
			title="Annex renamed to Device: check these",
			message="These still mention annex and may need updating:\n" + "\n".join(found),
		)
