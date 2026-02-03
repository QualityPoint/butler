# Facility Specifications Logic

This document describes the implementation of the facility specifications logic for the Butler Facility DocType.

## Overview

The facility specifications section handles two types of facilities:
- **Single-storey facilities**: Simple facilities with one floor
- **Multi-storey facilities**: Buildings with multiple floors

## Business Rules

### Single-storey Facilities (multistorey = 0)

**Required Fields:**
- `total_area` - Must be greater than 0

**Auto-cleared Fields:**
- `number_of_floors` - Set to `null`
- `floor_area` - Set to `null`

**Validation:**
- Total Area must be greater than 0
- Number of Floors and Floor Area are automatically cleared

### Multi-storey Facilities (multistorey = 1)

**Required Fields:**
- `number_of_floors` - Must be greater than 1
- `floor_area` - Must be greater than 0

**Calculated Fields:**
- `total_area` = `floor_area` × `number_of_floors`

**Validation:**
- Number of Floors must be greater than 1 (not just a single floor)
- Floor Area must be greater than 0
- Total Area is automatically calculated and becomes read-only

## Implementation

### Server-side (Python)

**File:** `butler/butler/doctype/facility/facility.py`

```python
def validate_facility_specifications(self):
    """Validate facility specification fields"""
    if self.multistorey:
        # Validate number_of_floors > 1
        if not self.number_of_floors or self.number_of_floors <= 1:
            frappe.throw(
                _("Number of Floors must be greater than 1 for multi-storey facilities"),
                frappe.ValidationError
            )

        # Validate floor_area > 0
        if not self.floor_area or self.floor_area <= 0:
            frappe.throw(
                _("Floor Area must be greater than 0"),
                frappe.ValidationError
            )
    else:
        # Clear multi-storey fields for non-multistorey
        self.number_of_floors = None
        self.floor_area = None
        
        # Validate total_area > 0 for non-multistorey
        if not self.total_area or self.total_area <= 0:
            frappe.throw(
                _("Total Area must be greater than 0"),
                frappe.ValidationError
            )

def calculate_total_area(self):
    """Calculate total area for multi-storey facilities"""
    if self.multistorey:
        if self.number_of_floors and self.floor_area:
            self.total_area = self.floor_area * self.number_of_floors
```

**Key Points:**
- Validation runs before save
- Automatic field clearing for data integrity
- Server-side calculation ensures correct total area

### Client-side (JavaScript)

**File:** `butler/butler/doctype/facility/facility.js`

```javascript
frappe.ui.form.on("Facility", {
    multistorey(frm) {
        if (frm.doc.multistorey) {
            frm.set_value("total_area", null);
        } else {
            frm.set_value({
                "number_of_floors": null,
                "floor_area": null,
            });
        }
    },

    number_of_floors(frm) {
        calculate_total_area(frm);
    },

    floor_area(frm) {
        calculate_total_area(frm);
    }
});

function calculate_total_area(frm) {
    if (frm.doc.multistorey && frm.doc.number_of_floors && frm.doc.floor_area) {
        frm.set_value("total_area", frm.doc.number_of_floors * frm.doc.floor_area);
    }
}
```

**Key Points:**
- Real-time field clearing when switching modes
- Instant calculation as user types
- Improves user experience with immediate feedback

## Field Dependencies

### JSON Configuration

```json
{
  "multistorey": {
    "fieldtype": "Check",
    "default": "0"
  },
  "number_of_floors": {
    "fieldtype": "Int",
    "depends_on": "multistorey",
    "mandatory_depends_on": "multistorey",
    "non_negative": 1
  },
  "floor_area": {
    "fieldtype": "Float",
    "depends_on": "multistorey",
    "mandatory_depends_on": "multistorey",
    "non_negative": 1
  },
  "total_area": {
    "fieldtype": "Float",
    "mandatory_depends_on": "eval:doc.multistorey===0;",
    "read_only_depends_on": "multistorey",
    "non_negative": 1
  }
}
```

## Data Flow

### Single-storey → Multi-storey

1. User checks `multistorey` checkbox
2. Client-side: `total_area` is cleared
3. UI shows: `number_of_floors` and `floor_area` fields
4. User enters `number_of_floors` (> 1) and `floor_area` (> 0)
5. Client-side: `total_area` auto-calculates in real-time
6. On save: Server validates and recalculates `total_area`

### Multi-storey → Single-storey

1. User unchecks `multistorey` checkbox
2. Client-side: `number_of_floors` and `floor_area` are cleared
3. UI hides multi-storey fields
4. User enters `total_area` (> 0)
5. On save: Server clears multi-storey fields and validates

## Validation Errors

### Error Messages

| Condition | Error Message |
|-----------|---------------|
| Multi-storey with floors ≤ 1 | "Number of Floors must be greater than 1 for multi-storey facilities" |
| Multi-storey with floor_area ≤ 0 | "Floor Area must be greater than 0" |
| Single-storey with total_area ≤ 0 | "Total Area must be greater than 0" |

## Testing Scenarios

### Scenario 1: Create Single-storey Facility
- Set `multistorey` = 0
- Enter `total_area` = 500
- Expected: Save successful

### Scenario 2: Create Multi-storey Facility
- Set `multistorey` = 1
- Enter `number_of_floors` = 3
- Enter `floor_area` = 150
- Expected: `total_area` = 450, Save successful

### Scenario 3: Invalid Multi-storey (floors = 1)
- Set `multistorey` = 1
- Enter `number_of_floors` = 1
- Expected: Validation error

### Scenario 4: Switch from Multi to Single
- Existing multi-storey facility with floors = 5, floor_area = 100
- Uncheck `multistorey`
- Expected: Fields cleared, user must enter `total_area`

## Best Practices

1. **Always validate on server-side** - Client-side validation can be bypassed
2. **Clear irrelevant fields** - Prevents data inconsistency
3. **Provide real-time feedback** - Better user experience
4. **Use meaningful error messages** - Help users understand requirements
5. **Calculate on both sides** - Client for UX, server for accuracy

## Related Files

- `butler/butler/doctype/facility/facility.json` - Field definitions
- `butler/butler/doctype/facility/facility.py` - Server-side logic
- `butler/butler/doctype/facility/facility.js` - Client-side logic

## Additional Validations

### Facility For Validation

The `facility_for` field is also validated to ensure data integrity:

```python
def validate_facility_for(self):
    """Validate that facility_for is either Customer or Lead"""
    allowed_doctypes = ["Customer", "Lead"]
    if self.facility_for not in allowed_doctypes:
        frappe.throw(
            _("Facility For must be either {0}").format(
                _(" or ").join([frappe.bold(dt) for dt in allowed_doctypes])),
            frappe.ValidationError
        )
```

**Client-side filter:**
```javascript
frm.set_query("facility_for", function () {
    return {
        filters: {
            name: ["in", ["Customer", "Lead"]]
        }
    };
});
```
