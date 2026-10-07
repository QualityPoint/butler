import json

import frappe

NAME = "Butler Portal"


def execute():
	"""Remove what is left of the empty Butler Portal workspace the app used to ship.

	The app stopped shipping it when the dock gained a Butler Portal button, which opens the
	`butler-portal` page and hands the browser over to the /butler portal. Removing a workspace's
	file does not remove its record, and on migrate the desk adopts such an orphan as the site's
	own: it puts the workspace in a custom module of the same name, gives that module a sidebar
	and pins the sidebar to the dock with the default icon. That leaves two problems:

	- a second Butler Portal on the dock, drawn with a hammer;
	- a workspace's route wins over a page's, so `/desk/butler-portal` opens the empty workspace
	  and the dock's own Butler Portal button never reaches the portal.

	Only the empty workspace and what was made for it go. A workspace a site has since filled in,
	or a module that holds anything else, is the site's and is left alone.
	"""
	if frappe.db.exists("Workspace", NAME) and not is_empty(frappe.get_doc("Workspace", NAME)):
		return

	# the dock rows that pin it, in the site's arrangement and in any user's
	frappe.db.delete("Dock Item", {"link_type": "Sidebar", "link_to": NAME})
	frappe.db.delete("Dock Item", {"link_type": "Workspace", "link_to": NAME})

	if frappe.db.exists("Sidebar", {"name": NAME, "standard": 0}):
		frappe.delete_doc("Sidebar", NAME, ignore_permissions=True, force=True)

	if frappe.db.exists("Workspace", NAME):
		frappe.delete_doc("Workspace", NAME, ignore_permissions=True, force=True)

	if frappe.db.exists("Module Def", {"name": NAME, "custom": 1}) and module_is_empty(NAME):
		frappe.delete_doc("Module Def", NAME, ignore_permissions=True, force=True)

	frappe.clear_cache()


def is_empty(workspace) -> bool:
	content = [block for block in json.loads(workspace.content or "[]") if block.get("type") != "spacer"]
	return not (content or workspace.links or workspace.shortcuts or workspace.charts or workspace.number_cards)


def module_is_empty(module: str) -> bool:
	return not any(
		frappe.db.exists(doctype, {"module": module})
		for doctype in ("DocType", "Page", "Report", "Workspace", "Sidebar", "Dashboard", "Print Format", "Web Form")
	)
