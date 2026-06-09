<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm"
      @click="emit('close')"
    />

    <!-- Dialog -->
    <div
      class="relative bg-card border-4 border-border shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200"
    >
      <div class="p-6">
        <h2 class="text-2xl font-head mb-4 border-b-2 border-border pb-2">
          {{ title }}
        </h2>
        <p class="font-sans text-base mb-6">{{ message }}</p>

        <div class="flex justify-end gap-3">
          <Button variant="outline" :disabled="isLoading" @click="emit('close')">
            {{ cancelText }}
          </Button>
          <Button :disabled="isLoading" @click="emit('confirm')">
            {{ isLoading ? "Processing..." : confirmText }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from "@/components/retroui/Button.vue";

withDefaults(
  defineProps<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
  }>(),
  {
    confirmText: "Confirm",
    cancelText: "Cancel",
    isLoading: false,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm"): void;
}>();
</script>
