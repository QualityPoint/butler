<template>
  <div class="border-4 border-border p-6 bg-secondary/10">
    <div class="flex items-center gap-2 mb-4">
      <MapPin class="w-6 h-6 text-secondary" />
      <h2 class="text-2xl font-head">Location &amp; Address</h2>
    </div>

    <!-- Map Container -->
    <div class="mb-6">
      <label class="block font-head mb-2">Select Location on Map</label>
      <p class="text-sm text-muted-foreground mb-3 font-sans">
        Click on the map to set the facility location
      </p>
      <div class="border-4 border-border h-[400px] relative">
        <LMap
          :zoom="13"
          :center="mapPosition"
          :use-global-leaflet="false"
          style="height: 100%; width: 100%"
          @click="onMapClick"
        >
          <LTileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <LMarker :lat-lng="mapPosition" :icon="markerIcon" />
        </LMap>
      </div>
    </div>

    <!-- Coordinates Display -->
    <div class="grid md:grid-cols-2 gap-6 mb-6">
      <div>
        <label for="latitude" class="block font-head mb-2">Latitude</label>
        <input
          id="latitude"
          name="latitude"
          type="text"
          :value="latitude"
          readonly
          class="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
          placeholder="Click on map"
        />
      </div>

      <div>
        <label for="longitude" class="block font-head mb-2">Longitude</label>
        <input
          id="longitude"
          name="longitude"
          type="text"
          :value="longitude"
          readonly
          class="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
          placeholder="Click on map"
        />
      </div>
    </div>

    <!-- National Address Fields -->
    <div class="space-y-6">
      <h3 class="text-xl font-head">National Address</h3>

      <div class="grid md:grid-cols-2 gap-6">
        <div>
          <label for="building_no" class="block font-head mb-2">
            Building Number
          </label>
          <input
            id="building_no"
            name="building_no"
            type="text"
            :value="buildingNo"
            class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
            placeholder="e.g., 123"
            @input="
              emit(
                'update:buildingNo',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </div>

        <div>
          <label for="street" class="block font-head mb-2">Street</label>
          <input
            id="street"
            name="street"
            type="text"
            :value="street"
            class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
            placeholder="e.g., Main Street"
            @input="
              emit('update:street', ($event.target as HTMLInputElement).value)
            "
          />
        </div>
      </div>

      <!-- Address Details -->
      <div>
        <label for="address_details" class="block font-head mb-2">
          Address Details
        </label>
        <textarea
          id="address_details"
          name="address_details"
          :rows="3"
          :value="addressDetails"
          class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary resize-none"
          placeholder="Additional address information..."
          @input="
            emit(
              'update:addressDetails',
              ($event.target as HTMLTextAreaElement).value,
            )
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MapPin } from "lucide-vue-next";
import { LMap, LTileLayer, LMarker } from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";

defineProps<{
  mapPosition: [number, number];
  latitude: string;
  longitude: string;
  street: string;
  buildingNo: string;
  addressDetails: string;
}>();

const emit = defineEmits<{
  (e: "map-click", lat: number, lng: number): void;
  (e: "update:street", value: string): void;
  (e: "update:buildingNo", value: string): void;
  (e: "update:addressDetails", value: string): void;
}>();

// Fix Leaflet's default marker icon (broken under bundlers).
const markerIcon = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function onMapClick(e: { latlng: { lat: number; lng: number } }) {
  emit("map-click", e.latlng.lat, e.latlng.lng);
}
</script>
