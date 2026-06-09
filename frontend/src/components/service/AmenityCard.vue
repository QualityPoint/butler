<template>
  <div
    :class="
      cn(
        'bg-card border-3 border-border p-4 cursor-grab active:cursor-grabbing',
        'shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5',
        'font-sans text-sm',
        (isSelected || isCategoryFull) && 'amenity-disabled',
        isSelected && 'opacity-40 cursor-not-allowed bg-muted',
        isCategoryFull && !isSelected && 'opacity-30 cursor-not-allowed bg-gray-50',
      )
    "
  >
    <div class="flex items-center justify-between">
      <span>{{ amenity.amenity_name }}</span>
      <span
        v-if="isSelected"
        class="text-xs bg-green-500 text-white px-2 py-0.5 border border-border"
      >
        ✓
      </span>
      <span
        v-else-if="isCategoryFull"
        class="text-xs bg-gray-400 text-white px-2 py-0.5 border border-border"
      >
        Full
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";
import type { Amenity } from "@/types/service";

withDefaults(
  defineProps<{
    amenity: Amenity;
    isSelected: boolean;
    isCategoryFull?: boolean;
  }>(),
  { isCategoryFull: false },
);
</script>
