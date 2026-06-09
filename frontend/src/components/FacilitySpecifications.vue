<template>
  <div class="space-y-6">
    <!-- Total Area -->
    <div>
      <label for="total_area" class="block font-head mb-2">
        Total Area (m²) <span class="text-destructive">*</span>
      </label>
      <input
        id="total_area"
        name="total_area"
        type="number"
        step="0.01"
        min="0.01"
        required
        :value="totalArea"
        :readonly="multistorey"
        :class="`w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary ${
          multistorey ? 'bg-muted cursor-not-allowed' : ''
        }`"
        placeholder="e.g., 500"
        @input="
          emit('update:totalArea', ($event.target as HTMLInputElement).value)
        "
      />
      <p
        v-if="multistorey"
        class="text-sm text-muted-foreground mt-2 font-sans"
      >
        Auto-calculated: Floor Area × Number of Floors
      </p>
    </div>

    <!-- Multi-storey Checkbox -->
    <div class="flex items-center gap-3">
      <input
        id="multistorey"
        name="multistorey"
        type="checkbox"
        :checked="multistorey"
        class="w-6 h-6 border-4 border-border"
        @change="
          emit('update:multistorey', ($event.target as HTMLInputElement).checked)
        "
      />
      <label for="multistorey" class="font-head text-lg">
        Multi-storey Building
      </label>
    </div>

    <!-- Number of Floors and Floor Area (conditional) -->
    <div
      v-if="multistorey"
      class="grid md:grid-cols-2 gap-6 p-6 border-4 border-border bg-secondary/10"
    >
      <div>
        <label for="number_of_floors" class="block font-head mb-2">
          Number of Floors <span class="text-destructive">*</span>
        </label>
        <input
          id="number_of_floors"
          name="number_of_floors"
          type="number"
          min="2"
          :required="multistorey"
          :value="numberOfFloors"
          class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
          placeholder="e.g., 5"
          @input="
            emit(
              'update:numberOfFloors',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
        <p class="text-sm text-muted-foreground mt-2 font-sans">
          Must be greater than 1
        </p>
      </div>

      <div>
        <label for="floor_area" class="block font-head mb-2">
          Floor Area (m²) <span class="text-destructive">*</span>
        </label>
        <input
          id="floor_area"
          name="floor_area"
          type="number"
          step="0.01"
          min="0.01"
          :required="multistorey"
          :value="floorArea"
          class="w-full px-4 py-3 border-4 border-border font-sans focus:outline-none focus:ring-4 focus:ring-primary"
          placeholder="e.g., 150"
          @input="
            emit('update:floorArea', ($event.target as HTMLInputElement).value)
          "
        />
        <p class="text-sm text-muted-foreground mt-2 font-sans">
          Area per floor
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  multistorey: boolean;
  totalArea: string;
  numberOfFloors: string;
  floorArea: string;
}>();

const emit = defineEmits<{
  (e: "update:multistorey", value: boolean): void;
  (e: "update:totalArea", value: string): void;
  (e: "update:numberOfFloors", value: string): void;
  (e: "update:floorArea", value: string): void;
}>();
</script>
