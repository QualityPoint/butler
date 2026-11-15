import json

import frappe
from frappe.tests import UnitTestCase

from butler.patches.v1_0.drop_amenity_annex_table import drop_orphan_table

TABLE = "Butler Orphan Table Test"


class TestDropOrphanTable(UnitTestCase):
	def setUp(self):
		frappe.db.sql_ddl(f"drop table if exists `tab{TABLE}`")
		frappe.db.sql_ddl(
			f"create table `tab{TABLE}` (name varchar(140) primary key, parent varchar(140), idx int, annex_name varchar(140))"
		)
		frappe.db.sql(
			f"insert into `tab{TABLE}` values ('r1', 'Kitchen', 1, 'AC'), ('r2', 'Kitchen', 2, 'Dimmer')"
		)

	def tearDown(self):
		frappe.db.sql_ddl(f"drop table if exists `tab{TABLE}`")
		frappe.db.rollback()

	def test_copies_rows_then_drops(self):
		file = frappe.get_doc("File", drop_orphan_table(TABLE))
		self.assertTrue(file.is_private)
		self.assertEqual([r["annex_name"] for r in json.loads(file.get_content())], ["AC", "Dimmer"])
		self.assertFalse(frappe.db.table_exists(TABLE, cached=False))
		file.delete(ignore_permissions=True)

	def test_kept_while_its_doctype_exists(self):
		self.assertIsNone(drop_orphan_table("ToDo"))
		self.assertTrue(frappe.db.table_exists("ToDo", cached=False))
