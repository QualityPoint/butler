from frappe.tests import UnitTestCase

from butler.patches.v1_0.rename_annex_in_print_formats_and_drawings import (
	rename_drawing,
	rename_in_jinja,
	rename_in_layout,
)


class TestRenameAnnexPatch(UnitTestCase):
	def test_jinja_renames_known_names_only(self):
		html = (
			'<h3>Annex list</h3>{% for a in frappe.get_all("Annex", fields=["annex_name", "annex_category"]) %}'
			'{{ a.annex_name }} {{ r.annexes_customised }}{% if g == "Amenity Annexes" %}x{% endif %}'
			"{% set annex_names = [] %}{% endfor %}"
		)
		self.assertEqual(
			rename_in_jinja(html),
			'<h3>Annex list</h3>{% for a in frappe.get_all("Device", fields=["device_name", "device_category"]) %}'
			'{{ a.device_name }} {{ r.devices_customised }}{% if g == "Amenity Annexes" %}x{% endif %}'
			"{% set annex_names = [] %}{% endfor %}",
		)

	def test_layout_renames_fieldnames_only(self):
		layout = [
			{"fieldname": "amenities", "label": "Annex Rows", "visible_columns": [{"fieldname": "annex"}]},
			{"fieldname": "_custom_html", "options": "<b>Annex</b> {{ doc.annex_quantity }}"},
		]
		self.assertEqual(
			rename_in_layout(layout),
			[
				{
					"fieldname": "amenities",
					"label": "Annex Rows",
					"visible_columns": [{"fieldname": "device"}],
				},
				{"fieldname": "_custom_html", "options": "<b>Annex</b> {{ doc.device_quantity }}"},
			],
		)

	def test_drawing_room_composition(self):
		drawing = {
			"floors": [
				{
					"rooms": [
						{"id": "r1", "annexes": [{"annex": "Dimmer", "qty": 2, "uom": "Nos"}]},
						{"id": "r2", "light_system_device": "DALI Gateway 64"},
					]
				}
			],
			"default_light_system_device": "Relay Actuator 12CH",
		}
		self.assertTrue(rename_drawing(drawing))
		rooms = drawing["floors"][0]["rooms"]
		self.assertEqual(rooms[0], {"id": "r1", "devices": [{"device": "Dimmer", "qty": 2, "uom": "Nos"}]})
		self.assertEqual(rooms[1], {"id": "r2", "light_system_device": "DALI Gateway 64"})
		self.assertFalse(rename_drawing(drawing))


class TestRenameAnnexInSidebars(UnitTestCase):
	def test_relabels_and_adds_device_type(self):
		import frappe

		from butler.patches.v1_0.rename_annex_in_sidebars import rename_items

		sidebar = frappe.get_doc(
			{
				"doctype": "Sidebar",
				"items": [
					{"type": "Section Break", "label": "Annex Setup"},
					{"type": "Link", "label": "Annex", "link_type": "DocType", "link_to": "Device"},
					{
						"type": "Link",
						"label": "Annex Category",
						"link_type": "DocType",
						"link_to": "Device Category",
					},
					{"type": "Link", "label": "Annex", "link_type": "DocType", "link_to": "Amenity"},
					{"type": "Section Break", "label": "Settings"},
				],
			}
		)
		self.assertTrue(rename_items(sidebar))
		self.assertEqual(
			[(item.idx, item.label, item.link_to) for item in sidebar.items],
			[
				(1, "Device Setup", None),
				(2, "Device", "Device"),
				(3, "Device Category", "Device Category"),
				(4, "Device Type", "Device Type"),
				(5, "Annex", "Amenity"),
				(6, "Settings", None),
			],
		)
		self.assertFalse(rename_items(sidebar))
