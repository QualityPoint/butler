<template>
  <!-- Loading -->
  <div
    v-if="isLoading"
    class="min-h-screen bg-background p-8 flex items-center justify-center"
  >
    <div class="text-2xl font-head">Loading facility details...</div>
  </div>

  <!-- Error -->
  <div v-else-if="error" class="min-h-screen bg-background p-8">
    <div class="max-w-7xl mx-auto">
      <ErrorBanner :error="error" title="Failed to load facility" />
      <div class="mt-4">
        <Button @click="handleBack">
          <ArrowLeft class="w-4 h-4 mr-2" />
          Back to Facilities
        </Button>
      </div>
    </div>
  </div>

  <!-- Not found -->
  <div
    v-else-if="!facility"
    class="min-h-screen bg-background p-8 flex items-center justify-center"
  >
    <div class="text-2xl font-head">Facility not found</div>
  </div>

  <!-- Content -->
  <div v-else class="min-h-screen bg-background p-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="bg-primary border-4 border-border p-4 sm:p-6 shadow-xl mb-8">
        <div
          class="flex flex-col lg:flex-row items-center justify-between gap-4"
        >
          <div
            class="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full lg:w-auto"
          >
            <div class="bg-secondary p-4 border-4 border-border flex-shrink-0">
              <Building2 class="w-12 h-12 text-white" />
            </div>
            <div class="text-center sm:text-left flex-1 max-w-2xl">
              <h1
                class="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-head break-words"
              >
                <input
                  v-if="isEditMode"
                  v-model="formData.facility_name"
                  name="facility_name"
                  type="text"
                  class="w-full px-4 py-2 border-4 border-border font-head bg-white text-base sm:text-lg"
                  placeholder="Facility Name"
                />
                <template v-else>{{ facility.facility_name }}</template>
              </h1>
              <p
                class="mt-1 sm:mt-2 font-sans text-sm sm:text-base text-muted-foreground break-words"
              >
                <select
                  v-if="isEditMode"
                  v-model="formData.facility_type"
                  name="facility_type"
                  class="px-4 py-2 border-4 border-border font-sans bg-white"
                >
                  <option value="">Select Type</option>
                  <option
                    v-for="type in facilityTypes"
                    :key="type.name"
                    :value="type.name"
                  >
                    {{ type.name }}
                  </option>
                </select>
                <template v-else>{{ facility.facility_type }}</template>
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 sm:gap-3">
            <template v-if="isEditMode">
              <Button
                variant="outline"
                :disabled="isUpdating"
                class="text-sm sm:text-base"
                @click="handleCancel"
              >
                <X class="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
                <span class="hidden sm:inline">Cancel</span>
              </Button>
              <Button
                :disabled="isUpdating"
                class="text-sm sm:text-base"
                @click="handleSave"
              >
                <Save class="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
                <span class="hidden sm:inline">{{
                  isUpdating ? "Saving..." : "Save"
                }}</span>
              </Button>
            </template>
            <template v-else>
              <Button
                variant="outline"
                class="text-sm sm:text-base"
                @click="handleBack"
              >
                <ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
                <span class="hidden sm:inline">Back</span>
              </Button>
              <Button class="text-sm sm:text-base" @click="isEditMode = true">
                <Edit class="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
                <span class="hidden sm:inline">Edit</span>
              </Button>
            </template>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="grid lg:grid-cols-2 gap-8">
        <!-- Left Column - Specifications -->
        <div class="border-4 border-border p-6 bg-secondary/10">
          <div class="flex items-center gap-2 mb-6">
            <Layers class="w-6 h-6 text-secondary" />
            <h2 class="text-2xl font-head">Specifications</h2>
          </div>

          <div class="space-y-6">
            <!-- Multi-storey Checkbox -->
            <div v-if="isEditMode" class="flex items-center gap-3">
              <input
                id="multistorey"
                type="checkbox"
                :checked="formData.multistorey"
                class="w-5 h-5 border-4 border-border"
                @change="
                  handleMultistoreyChange(
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              <label
                for="multistorey"
                class="font-head text-lg cursor-pointer"
              >
                Multi-storey Building
              </label>
            </div>

            <!-- Multi-storey Badge (view mode) -->
            <div
              v-if="!isEditMode && facility.multistorey === 1"
              class="px-4 py-2 bg-accent border-2 border-border font-sans inline-block"
            >
              Multi-storey Building
            </div>

            <!-- Number of Floors (if multi-storey) -->
            <div v-if="formData.multistorey">
              <label
                for="number_of_floors"
                class="block font-head mb-2 text-sm"
              >
                Number of Floors
                <span v-if="isEditMode" class="text-destructive">*</span>
              </label>
              <input
                v-if="isEditMode"
                id="number_of_floors"
                name="number_of_floors"
                type="number"
                :value="formData.number_of_floors"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="e.g., 3"
                min="1"
                @input="
                  handleNumberOfFloorsChange(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
              <div
                v-else
                class="px-4 py-3 border-4 border-border font-sans bg-muted"
              >
                {{ facility.number_of_floors || "N/A" }}
              </div>
            </div>

            <!-- Floor Area (if multi-storey) -->
            <div v-if="formData.multistorey">
              <label for="floor_area" class="block font-head mb-2 text-sm">
                Floor Area (m²)
                <span v-if="isEditMode" class="text-destructive">*</span>
              </label>
              <input
                v-if="isEditMode"
                id="floor_area"
                name="floor_area"
                type="number"
                step="0.01"
                :value="formData.floor_area"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="e.g., 150.5"
                min="0"
                @input="
                  handleFloorAreaChange(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
              <div
                v-else
                class="px-4 py-3 border-4 border-border font-sans bg-muted"
              >
                {{ facility.floor_area ? `${facility.floor_area} m²` : "N/A" }}
              </div>
            </div>

            <!-- Total Area -->
            <div>
              <label for="total_area" class="block font-head mb-2 text-sm">
                Total Area (m²)
                <span v-if="isEditMode" class="text-destructive">*</span>
              </label>
              <input
                v-if="isEditMode"
                id="total_area"
                v-model="formData.total_area"
                name="total_area"
                type="number"
                step="0.01"
                :disabled="formData.multistorey"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
                placeholder="e.g., 500.0"
                min="0"
              />
              <div
                v-else
                class="px-4 py-3 border-4 border-border font-sans bg-muted"
              >
                {{ facility.total_area ? `${facility.total_area} m²` : "N/A" }}
              </div>
              <p
                v-if="isEditMode && formData.multistorey"
                class="text-xs text-muted-foreground mt-1 font-sans"
              >
                Auto-calculated from floors × floor area
              </p>
            </div>
          </div>
        </div>

        <!-- Right Column - Location & Address -->
        <div class="border-4 border-border p-6 bg-secondary/10">
          <div class="flex items-center gap-2 mb-6">
            <MapPin class="w-6 h-6 text-secondary" />
            <h2 class="text-2xl font-head">Location &amp; Address</h2>
          </div>

          <div class="space-y-6">
            <!-- Map -->
            <div>
              <label class="block font-head mb-2">
                {{ isEditMode ? "Click on map to set location" : "Location" }}
              </label>
              <p
                v-if="isEditMode"
                class="text-sm text-muted-foreground mb-3 font-sans"
              >
                Click on the map to update the facility location
              </p>
              <div class="border-4 border-border h-[300px] relative">
                <LMap
                  :zoom="15"
                  :center="mapPosition"
                  :use-global-leaflet="false"
                  :options="{ scrollWheelZoom: isEditMode }"
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

            <!-- Coordinates -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="latitude" class="block font-head mb-2 text-sm">
                  Latitude
                </label>
                <input
                  id="latitude"
                  name="latitude"
                  type="text"
                  :value="formData.latitude"
                  readonly
                  class="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
                  placeholder="Click on map"
                />
              </div>
              <div>
                <label for="longitude" class="block font-head mb-2 text-sm">
                  Longitude
                </label>
                <input
                  id="longitude"
                  name="longitude"
                  type="text"
                  :value="formData.longitude"
                  readonly
                  class="w-full px-4 py-3 border-4 border-border font-sans bg-muted cursor-not-allowed"
                  placeholder="Click on map"
                />
              </div>
            </div>

            <!-- Building Number -->
            <div>
              <label for="building_no" class="block font-head mb-2 text-sm">
                Building Number
              </label>
              <input
                v-if="isEditMode"
                id="building_no"
                v-model="formData.building_no"
                name="building_no"
                type="text"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="e.g., 123"
              />
              <div
                v-else
                class="px-4 py-3 border-4 border-border font-sans bg-muted"
              >
                {{ facility.building_no || "N/A" }}
              </div>
            </div>

            <!-- Street -->
            <div>
              <label for="street" class="block font-head mb-2 text-sm">
                Street
              </label>
              <input
                v-if="isEditMode"
                id="street"
                v-model="formData.street"
                name="street"
                type="text"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
                placeholder="e.g., Main Street"
              />
              <div
                v-else
                class="px-4 py-3 border-4 border-border font-sans bg-muted"
              >
                {{ facility.street || "N/A" }}
              </div>
            </div>

            <!-- Address Details -->
            <div>
              <label
                for="address_details"
                class="block font-head mb-2 text-sm"
              >
                Address Details
              </label>
              <textarea
                v-if="isEditMode"
                id="address_details"
                v-model="formData.address_details"
                name="address_details"
                :rows="3"
                class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary resize-none"
                placeholder="Additional address information..."
              />
              <div
                v-else
                class="px-4 py-3 border-4 border-border font-sans bg-muted min-h-[80px]"
              >
                {{ facility.address_details || "N/A" }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Metadata -->
      <div class="mt-8 border-4 border-border p-6 bg-card">
        <h3 class="font-head text-xl mb-4">Document Information</h3>
        <div class="grid md:grid-cols-3 gap-4 font-sans text-sm">
          <div>
            <span class="text-muted-foreground">Document ID:</span>
            <span class="font-bold">{{ facility.name }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Created:</span>
            <span class="font-bold">
              {{ new Date(facility.creation).toLocaleDateString() }}
            </span>
          </div>
          <div>
            <span class="text-muted-foreground">Modified:</span>
            <span class="font-bold">
              {{ new Date(facility.modified).toLocaleDateString() }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Layers,
  Edit,
  Save,
  X,
} from "lucide-vue-next";
import { LMap, LTileLayer, LMarker } from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import Button from "@/components/retroui/Button.vue";
import ErrorBanner from "@/components/ui/ErrorBanner.vue";
import {
  showSuccess,
  showWarning,
  showFrappeError,
} from "@/lib/errorHandler";
import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappeGetDocList } from "@/composables/frappe";
import type { Facility } from "@/types/Butler/Facility";

const markerIcon = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const route = useRoute();
const router = useRouter();

const facilityId = route.params.facilityId as string;
const leadId = (route.query.lead_id as string) || "";
const facilityFor = (route.query.facility_for as string) || "Lead";

const isEditMode = ref(false);
const formData = reactive({
  facility_name: "",
  facility_type: "",
  total_area: "",
  multistorey: false,
  number_of_floors: "",
  floor_area: "",
  street: "",
  building_no: "",
  latitude: "",
  longitude: "",
  address_details: "",
});
const mapPosition = ref<[number, number]>([24.7136, 46.6753]);

const { data: facility, error, isLoading, mutate } = useFrappeGetDoc<Facility>(
  "Facility",
  facilityId,
);

const { data: facilityTypes } = useFrappeGetDocList<{ name: string }>(
  "Facility Type",
  { fields: ["name"], limit: 100 },
);

const { updateDoc, loading: isUpdating } = useFrappeUpdateDoc<Facility>();

function applyFacilityToForm(f: Facility) {
  formData.facility_name = f.facility_name || "";
  formData.facility_type = f.facility_type || "";
  formData.total_area = f.total_area?.toString() || "";
  formData.multistorey = f.multistorey === 1;
  formData.number_of_floors = f.number_of_floors?.toString() || "";
  formData.floor_area = f.floor_area?.toString() || "";
  formData.street = f.street || "";
  formData.building_no = f.building_no || "";
  formData.latitude = f.latitude?.toString() || "";
  formData.longitude = f.longitude?.toString() || "";
  formData.address_details = f.address_details || "";

  if (f.latitude && f.longitude) {
    mapPosition.value = [f.latitude, f.longitude];
  }
}

watch(
  facility,
  (f) => {
    if (f) applyFacilityToForm(f);
  },
  { immediate: true },
);

function handleBack() {
  router.push(
    `/facilities?lead_id=${leadId}&facility_for=${facilityFor}`,
  );
}

function handleMultistoreyChange(checked: boolean) {
  formData.multistorey = checked;
  formData.total_area = checked ? "" : formData.total_area;
  formData.number_of_floors = checked ? formData.number_of_floors : "";
  formData.floor_area = checked ? formData.floor_area : "";
}

function handleNumberOfFloorsChange(value: string) {
  formData.number_of_floors = value;
  const floors = parseFloat(value);
  const area = parseFloat(formData.floor_area);
  if (floors && area && floors > 0 && area > 0) {
    formData.total_area = (floors * area).toString();
  }
}

function handleFloorAreaChange(value: string) {
  formData.floor_area = value;
  const floors = parseFloat(formData.number_of_floors);
  const area = parseFloat(value);
  if (floors && area && floors > 0 && area > 0) {
    formData.total_area = (floors * area).toString();
  }
}

function onMapClick(e: { latlng: { lat: number; lng: number } }) {
  if (!isEditMode.value) return;
  const { lat, lng } = e.latlng;
  mapPosition.value = [lat, lng];
  formData.latitude = lat.toFixed(6);
  formData.longitude = lng.toFixed(6);
}

function handleCancel() {
  isEditMode.value = false;
  if (facility.value) applyFacilityToForm(facility.value);
}

async function handleSave() {
  if (
    !formData.facility_name ||
    !formData.facility_type ||
    !formData.total_area
  ) {
    showWarning("Please fill in all required fields");
    return;
  }

  if (!facilityId) return;

  try {
    const updateData: Partial<Facility> = {
      facility_name: formData.facility_name,
      facility_type: formData.facility_type,
      total_area: parseFloat(formData.total_area),
      multistorey: formData.multistorey ? 1 : 0,
      number_of_floors:
        formData.multistorey && formData.number_of_floors
          ? parseInt(formData.number_of_floors)
          : undefined,
      floor_area:
        formData.multistorey && formData.floor_area
          ? parseFloat(formData.floor_area)
          : undefined,
      street: formData.street || undefined,
      building_no: formData.building_no || undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      longitude: formData.longitude
        ? parseFloat(formData.longitude)
        : undefined,
      address_details: formData.address_details || undefined,
    };

    await updateDoc("Facility", facilityId, updateData);
    showSuccess("Facility updated successfully!");
    isEditMode.value = false;
    mutate();
  } catch (err) {
    console.error("Update failed:", err);
    showFrappeError(err);
  }
}
</script>
