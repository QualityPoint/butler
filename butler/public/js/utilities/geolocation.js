// Copyright (c) 2025, QP and contributors
// For license information, please see license.txt

frappe.provide("butler.geolocation");

butler.geolocation = {
    parse_geolocation(geolocation_value) {
        if (!geolocation_value) {
            return { latitude: null, longitude: null };
        }

        try {
            const geo_data = typeof geolocation_value === 'string'
                ? JSON.parse(geolocation_value)
                : geolocation_value;

            if (geo_data.type === "FeatureCollection" && geo_data.features && geo_data.features.length > 0) {
                const feature = geo_data.features[geo_data.features.length - 1];
                if (feature.geometry && feature.geometry.type === "Point" && feature.geometry.coordinates) {
                    const coordinates = feature.geometry.coordinates;
                    if (coordinates.length >= 2) {
                        // GeoJSON format is [longitude, latitude]
                        return {
                            latitude: parseFloat(coordinates[1]),
                            longitude: parseFloat(coordinates[0])
                        };
                    }
                }
            } else if (geo_data.coordinates && geo_data.coordinates.length >= 2) {
                return {
                    latitude: parseFloat(geo_data.coordinates[1]),
                    longitude: parseFloat(geo_data.coordinates[0])
                };
            }
        } catch (e) {
            console.error("Failed to parse geolocation:", e, geolocation_value);
        }

        return { latitude: null, longitude: null };
    },

    build_geolocation_json(latitude, longitude) {
        if (latitude == null || longitude == null) {
            return null;
        }

        try {
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng)) {
                return null;
            }

            const geo_json = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "Point",
                            coordinates: [lng, lat]  // GeoJSON format is [longitude, latitude]
                        }
                    }
                ]
            };

            return JSON.stringify(geo_json);
        } catch (e) {
            console.error("Failed to build geolocation JSON:", e);
            return null;
        }
    },

    sync_geolocation_to_floats(frm, geolocation_field = 'location', latitude_field = 'latitude', longitude_field = 'longitude') {
        const geolocation_value = frm.doc[geolocation_field];

        let is_empty = false;

        if (!geolocation_value) {
            is_empty = true;
        } else {
            try {
                const geo_data = typeof geolocation_value === 'string'
                    ? JSON.parse(geolocation_value)
                    : geolocation_value;

                if (geo_data.type === "FeatureCollection" && (!geo_data.features || geo_data.features.length === 0)) {
                    is_empty = true;
                }
            } catch (e) {
                is_empty = true;
            }
        }

        if (is_empty) {
            frm.set_value(latitude_field, null);
            frm.set_value(longitude_field, null);
            return;
        }

        const { latitude, longitude } = this.parse_geolocation(geolocation_value);

        if (latitude != null && longitude != null) {
            frm.set_value(latitude_field, latitude);
            frm.set_value(longitude_field, longitude);

            // Keep only the last pin
            try {
                const geo_data = typeof geolocation_value === 'string'
                    ? JSON.parse(geolocation_value)
                    : geolocation_value;

                if (geo_data.type === "FeatureCollection" && geo_data.features && geo_data.features.length > 1) {
                    const single_pin_json = this.build_geolocation_json(latitude, longitude);
                    if (single_pin_json) {
                        frm.set_value(geolocation_field, single_pin_json);
                    }
                }
            } catch (e) {
                console.error("Failed to clean multiple pins:", e);
            }
        } else {
            frm.set_value(latitude_field, null);
            frm.set_value(longitude_field, null);
        }
    },

    sync_floats_to_geolocation(frm, latitude_field = 'latitude', longitude_field = 'longitude', geolocation_field = 'location') {
        const latitude = frm.doc[latitude_field];
        const longitude = frm.doc[longitude_field];

        if (latitude == null && longitude == null) {
            frm.set_value(geolocation_field, null);
            return;
        }

        if (latitude == null || longitude == null) {
            frappe.show_alert({
                message: __("Both latitude and longitude are required to update location."),
                indicator: "orange"
            });
            return;
        }

        const geo_json = this.build_geolocation_json(latitude, longitude);

        if (geo_json) {
            frm.set_value(geolocation_field, geo_json);
        }
    },
};
