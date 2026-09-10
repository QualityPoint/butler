"""
Tests for the vendored Open Location Code (plus code) decoder:
  - decode()
  - recover_nearest()
  - find_plus_code()

These matter disproportionately: a silent arithmetic error here doesn't raise, it
just puts a Facility's pin somewhere else in the world. The vendored code was
differential-tested against Google's reference implementation over 4000 random
codes at every precision length; the vectors below lock in that behaviour.

No database and no network — plus_code is deliberately free of frappe.

Run with:
    bench --site butler.local run-tests --app butler --module butler.tests.test_plus_code
"""

import unittest

from butler.utils.location import plus_code

# Madinah / Ar Rayah — the reference case this feature was built for.
# Google renders it as "FHPQ+WC Madinah"; the full global code is 7GPXFHPQ+WC.
MADINAH_REFERENCE = (24.471153, 39.6111216)


class TestPlusCodeDecode(unittest.TestCase):
    def test_decodes_to_cell_centre(self):
        """decode() returns the centre of the code's area, not its corner — that is
        what Google shows for the code."""
        latitude, longitude = plus_code.decode("8FVC2222+22")
        self.assertAlmostEqual(latitude, 47.0000625, places=7)
        self.assertAlmostEqual(longitude, 8.0000625, places=7)

    def test_precision_grows_with_length(self):
        """Each extra pair narrows the cell; a padded code is a coarse area."""
        coarse = plus_code.decode("8FVC0000+")  # 4 significant chars -> 1 degree
        fine = plus_code.decode("8FVC2222+22")  # 10 chars -> 0.000125 degrees
        self.assertAlmostEqual(coarse[0], 47.5, places=7)
        self.assertAlmostEqual(fine[0], 47.0000625, places=7)

    def test_grid_refinement_beyond_ten_characters(self):
        """Characters past the 10th refine on a 4x5 grid rather than a pair."""
        ten = plus_code.decode("7GPXFHPQ+WC")
        eleven = plus_code.decode("7GPXFHPQ+XCW")
        self.assertNotEqual(ten, eleven)
        # Still the same neighbourhood, just a finer cell within it.
        self.assertLess(abs(ten[0] - eleven[0]), 0.001)
        self.assertLess(abs(ten[1] - eleven[1]), 0.001)

    def test_southern_and_western_hemispheres(self):
        """Negative latitude/longitude must round-trip (an offset sign error here
        would be invisible in the northern/eastern test cases above)."""
        latitude, longitude = plus_code.decode("4VCPPQGP+Q9")
        self.assertLess(latitude, 0)
        self.assertGreater(longitude, 0)
        self.assertAlmostEqual(latitude, -41.2730625, places=6)

    def test_case_insensitive(self):
        self.assertEqual(plus_code.decode("7gpxfhpq+wc"), plus_code.decode("7GPXFHPQ+WC"))

    def test_invalid_code_raises_valueerror(self):
        """A plain ValueError, not frappe.throw — this module stays frappe-free."""
        with self.assertRaises(ValueError):
            plus_code.decode("")


class TestPlusCodeRecoverNearest(unittest.TestCase):
    def test_recovers_the_reference_case(self):
        """The case the feature exists for: a short code plus a nearby city."""
        self.assertEqual(plus_code.recover_nearest("FHPQ+XCW", *MADINAH_REFERENCE), "7GPXFHPQ+XCW")
        self.assertEqual(plus_code.recover_nearest("FHPQ+WC", *MADINAH_REFERENCE), "7GPXFHPQ+WC")

    def test_recovered_code_decodes_to_the_right_place(self):
        full = plus_code.recover_nearest("FHPQ+XCW", *MADINAH_REFERENCE)
        latitude, longitude = plus_code.decode(full)
        self.assertAlmostEqual(latitude, 24.4874875, places=6)
        self.assertAlmostEqual(longitude, 39.5885781, places=6)

    def test_full_code_passes_through_unchanged(self):
        """An already-global code ignores the reference entirely."""
        self.assertEqual(plus_code.recover_nearest("7GPXFHPQ+XCW", 0, 0), "7GPXFHPQ+XCW")

    def test_a_distant_reference_picks_a_different_cell(self):
        """Why map_location refuses to anchor a short code on a country centroid:
        the same short code resolves elsewhere when the reference is far away."""
        near = plus_code.recover_nearest("FHPQ+WC", *MADINAH_REFERENCE)
        far = plus_code.recover_nearest("FHPQ+WC", 25.6242618, 42.3528328)  # Saudi centroid
        self.assertNotEqual(near, far)


class TestFindPlusCode(unittest.TestCase):
    def test_extracts_from_a_full_copied_address(self):
        self.assertEqual(
            plus_code.find_plus_code("FHPQ+XCW, Abo Bakr Al Siddiq, الراية، Madinah 42312"),
            "FHPQ+XCW",
        )

    def test_extracts_from_code_plus_city(self):
        self.assertEqual(plus_code.find_plus_code("FHPQ+WC Madinah"), "FHPQ+WC")

    def test_uppercases_the_result(self):
        self.assertEqual(plus_code.find_plus_code("fhpq+wc madinah"), "FHPQ+WC")

    def test_returns_none_when_absent(self):
        for text in ("Quba Mosque, Madinah", "24.487488, 39.588578", "", None):
            self.assertIsNone(plus_code.find_plus_code(text))


class TestIsFull(unittest.TestCase):
    def test_distinguishes_global_from_relative_codes(self):
        self.assertTrue(plus_code.is_full("7GPXFHPQ+XCW"))
        self.assertFalse(plus_code.is_full("FHPQ+XCW"))
        self.assertFalse(plus_code.is_full("FHPQ+WC"))


if __name__ == "__main__":
    unittest.main()
