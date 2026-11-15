"""Rename fields in place, for patches that run before the DocTypes sync (`pre_model_sync`).

Frappe's `rename_field` copies values into a column the new schema has already added and
leaves the old one behind; these rename the column itself and update the same references.
"""

import frappe
from frappe import _
from frappe.model.utils.rename_field import (
	update_property_setters,
	update_reports,
	update_user_settings,
	update_users_report_view_settings,
)


def rename_column(doctype: str, old: str, new: str) -> None:
	"""Rename a column keeping its whole definition, NOT NULL and default included.

	`frappe.db.rename_column` restates only the type, and model sync never restores
	NOT NULL or a 0 default on number and check columns (`frappe/database/schema.py`).
	"""
	frappe.db.sql_ddl(f"alter table `tab{doctype}` rename column `{old}` to `{new}`")
	frappe.client_cache.delete_value(f"table_columns::tab{doctype}")


def rename_columns(doctype: str, renames: dict[str, str]) -> None:
	"""Rename each `old: new` column of `doctype`; one already renamed is skipped.

	A name with no column (a section break, say) only has its references updated.
	"""
	for old, new in renames.items():
		has_old, has_new = frappe.db.has_column(doctype, old), frappe.db.has_column(doctype, new)
		if has_old and has_new:
			frappe.throw(
				_("{0} has both columns {1} and {2}; merge them by hand first.").format(doctype, old, new)
			)
		if has_old:
			rename_column(doctype, old, new)
		update_references(doctype, old, new)


def rename_table_field(parent: str, child: str, old: str, new: str) -> None:
	"""Rename the table field `old` of `parent`, whose rows live in `child`."""
	frappe.db.sql(
		f"update `tab{child}` set parentfield=%s where parenttype=%s and parentfield=%s",
		(new, parent, old),
	)
	update_references(parent, old, new)


def rename_single_fields(doctype: str, renames: dict[str, str]) -> None:
	"""Rename the stored values of a single DocType's fields."""
	for old, new in renames.items():
		if not frappe.db.sql("select 1 from `tabSingles` where doctype=%s and field=%s", (doctype, new)):
			frappe.db.sql(
				"update `tabSingles` set field=%s where doctype=%s and field=%s",
				(new, doctype, old),
			)
		update_references(doctype, old, new)


def update_references(doctype: str, old: str, new: str) -> None:
	"""Point saved reports, list settings and property setters at the new fieldname."""
	update_reports(doctype, old, new)
	update_users_report_view_settings(doctype, old, new)
	update_property_setters(doctype, old, new)
	update_user_settings(doctype, old, new)
