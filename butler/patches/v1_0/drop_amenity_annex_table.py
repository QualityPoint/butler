import json

import frappe


def execute():
	"""Drop `tabAmenity Annex`, the table of Amenity's old `annexes` rows that no DocType uses."""
	drop_orphan_table("Amenity Annex")


def drop_orphan_table(doctype: str) -> str | None:
	"""Keep a JSON copy of an orphan table as a private File, then drop the table.

	Skipped while a DocType of that name exists. Returns the File's name, or None.
	"""
	if frappe.db.exists("DocType", doctype) or not frappe.db.table_exists(doctype, cached=False):
		return None

	rows = frappe.db.sql(f"select * from `tab{doctype}` order by parent, idx", as_dict=True)
	copy = None
	if rows:
		copy = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"{frappe.scrub(doctype)}_table_copy.json",
				"is_private": 1,
				"content": json.dumps(rows, default=str, indent=1, ensure_ascii=False),
			}
		).insert(ignore_permissions=True)

	frappe.db.sql_ddl(f"drop table `tab{doctype}`")
	frappe.client_cache.delete_value(f"table_columns::tab{doctype}")
	frappe.logger("butler").info(f"Dropped orphan table tab{doctype}: {len(rows)} rows copied")
	return copy and copy.name
