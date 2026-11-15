import frappe

LABELS = {
	"Annex Setup": "Device Setup",
	"Annex": "Device",
	"Annex Category": "Device Category",
	"Annex Type": "Device Type",
	"Annex Price": "Device Price",
}


def execute():
	"""Relabel the Annex items of site sidebars to Device, and add Device Type next to them.

	The app's own sidebar ships from its file; a sidebar saved on the site keeps its labels.
	"""
	for name in frappe.get_all("Sidebar", filters={"standard": 0}, pluck="name"):
		sidebar = frappe.get_doc("Sidebar", name)
		if not rename_items(sidebar):
			continue
		# A site's sidebar may hold a stale link of its own; that must not stop the migrate.
		sidebar.flags.ignore_links = True
		try:
			frappe.db.savepoint("rename_annex_in_sidebar")
			sidebar.save(ignore_permissions=True)
			frappe.logger("butler").info(f"Sidebar {name}: annex items renamed to device")
		except Exception:
			frappe.db.rollback(save_point="rename_annex_in_sidebar")
			frappe.log_error(title=f"Sidebar {name}: annex items not renamed")


def rename_items(sidebar) -> bool:
	"""Relabel exact Annex labels, then add a Device Type link after the last Device link.

	Returns whether anything changed.
	"""
	changed = False
	for item in sidebar.items:
		if item.label in LABELS and (item.type == "Section Break" or item.link_to == LABELS[item.label]):
			item.label = LABELS[item.label]
			changed = True

	links = [item.link_to for item in sidebar.items if item.type == "Link" and item.link_type == "DocType"]
	if "Device" in links and "Device Type" not in links:
		after = max(
			i for i, item in enumerate(sidebar.items) if item.link_to in ("Device", "Device Category")
		)
		row = sidebar.append(
			"items",
			{
				"type": "Link",
				"label": "Device Type",
				"link_type": "DocType",
				"link_to": "Device Type",
				"child": 1,
			},
		)
		sidebar.items.remove(row)
		sidebar.items.insert(after + 1, row)
		for idx, item in enumerate(sidebar.items, 1):
			item.idx = idx
		changed = True

	return changed
