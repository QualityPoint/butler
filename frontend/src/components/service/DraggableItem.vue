<template>
  <div
    :class="
      cn(
        'group relative bg-card border-3 border-border p-3 sm:p-4 min-h-16',
        'shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5',
        'font-sans text-sm sm:text-base',
        isDragging ? 'opacity-50' : 'opacity-100',
      )
    "
  >
    <div class="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
      <div
        class="drag-handle flex-1 min-w-0 cursor-grab active:cursor-grabbing order-1"
      >
        <span class="font-medium truncate block">{{ item.name }}</span>
      </div>

      <!-- Quantity controls -->
      <div
        v-if="showQuantity"
        class="flex items-center gap-1 order-3 sm:order-2"
      >
        <button
          :disabled="item.count <= 1 || disabled"
          class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-lg sm:text-xl font-bold bg-gray-200 text-white hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          @click.stop="emit('decrement')"
        >
          −
        </button>
        <span
          class="font-head text-sm sm:text-base min-w-8 sm:min-w-10 text-center px-1 sm:px-2"
        >
          {{ item.count }}
        </span>
        <button
          :disabled="disabled"
          class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-lg sm:text-xl font-bold bg-gray-800 text-white hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          @click.stop="emit('increment')"
        >
          +
        </button>
      </div>

      <span
        class="text-xs bg-primary px-2 py-1 border-2 border-border font-head whitespace-nowrap order-2 sm:order-3"
      >
        {{ item.category }}
      </span>
    </div>

    <button
      v-if="!disabled"
      class="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full border-2 border-border opacity-0 group-hover:opacity-100 transition-opacity font-bold text-sm hover:bg-red-600 flex items-center justify-center"
      @click.stop="emit('remove')"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";
import type { PackageItem } from "@/data/packages";

withDefaults(
  defineProps<{
    item: PackageItem;
    isDragging?: boolean;
    showQuantity?: boolean;
    disabled?: boolean;
  }>(),
  { isDragging: false, showQuantity: true, disabled: false },
);

const emit = defineEmits<{
  (e: "remove"): void;
  (e: "increment"): void;
  (e: "decrement"): void;
}>();
</script>
