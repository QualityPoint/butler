import frappe
from frappe.tests import UnitTestCase

from butler.utils.schema_rename import rename_column, rename_columns

TABLE = "Butler Schema Rename Test"


class TestSchemaRename(UnitTestCase):
	def setUp(self):
		frappe.db.sql_ddl(f"drop table if exists `tab{TABLE}`")
		frappe.db.sql_ddl(
			f"create table `tab{TABLE}` (name varchar(140) primary key, "
			"annex_amount decimal(21,9) not null default 0, is_annex tinyint not null default 0)"
		)

	def tearDown(self):
		frappe.db.sql_ddl(f"drop table if exists `tab{TABLE}`")
		frappe.client_cache.delete_value(f"table_columns::tab{TABLE}")

	def column(self, name):
		return frappe.db.sql(
			"""select is_nullable, column_default from information_schema.columns
			where table_schema=database() and table_name=%s and column_name=%s""",
			(f"tab{TABLE}", name),
		)

	def test_rename_keeps_not_null_and_default(self):
		rename_column(TABLE, "annex_amount", "device_amount")
		self.assertEqual(self.column("device_amount"), (("NO", "0.000000000"),))
		self.assertFalse(self.column("annex_amount"))
		self.assertTrue(frappe.db.has_column(TABLE, "device_amount"))

	def test_both_columns_present_is_refused(self):
		frappe.db.sql_ddl(f"alter table `tab{TABLE}` add column is_device tinyint not null default 0")
		with self.assertRaises(frappe.ValidationError):
			rename_columns(TABLE, {"is_annex": "is_device"})
