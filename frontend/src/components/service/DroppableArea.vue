<template>
  <div class="bg-card border-4 border-border p-6 shadow-lg">
    <div
      class="flex justify-between items-center mb-4 border-b-2 border-border pb-2"
    >
      <h2 class="text-xl sm:text-2xl font-head break-words">Your Package</h2>
      <Button
        v-if="modelValue.length > 0"
        variant="outline"
        size="sm"
        @click="emit('clearAll')"
      >
        Clear All
      </Button>
    </div>

    <draggable
      :model-value="modelValue"
      :group="{ name: 'amenities', pull: true, put: !disabled }"
      :disabled="disabled"
      item-key="id"
      handle=".drag-handle"
      ghost-class="opacity-50"
      :class="
        cn(
          'h-125 rounded p-4 transition-colors overflow-y-auto bg-muted/30 border-2 border-dashed border-muted',
          modelValue.length === 0 && 'flex items-center justify-center',
        )
      "
      @update:model-value="emit('update:modelValue', $event)"
      @add="emit('add', $event)"
    >
      <template #header>
        <div
          v-if="modelValue.length === 0"
          class="text-center text-muted-foreground"
        >
          <p class="text-xl font-head mb-2">Drop items here</p>
          <p class="font-sans">
            Drag items from the left to build your package
          </p>
        </div>
      </template>
      <template #item="{ element }">
        <div class="mb-3">
          <DraggableItem
            :item="element"
            :disabled="disabled"
            @remove="emit('remove', element.id)"
            @increment="emit('increment', element.id)"
            @decrement="emit('decrement', element.id)"
          />
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import draggable from "vuedraggable";
import Button from "@/components/retroui/Button.vue";
import DraggableItem from "./DraggableItem.vue";
import { cn } from "@/lib/utils";
import type { PackageItem } from "@/data/packages";

defineProps<{
  modelValue: PackageItem[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: PackageItem[]): void;
  (e: "add", event: unknown): void;
  (e: "remove", itemId: string): void;
  (e: "increment", itemId: string): void;
  (e: "decrement", itemId: string): void;
  (e: "clearAll"): void;
}>();
</script>
