<template>
  <template v-if="isOpen">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-black/50 z-40" @click="emit('close')" />

    <!-- Modal -->
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="bg-[#fdf4c4] border-4 border-border shadow-xl max-w-md w-full p-8 animate-in fade-in zoom-in duration-200"
      >
        <div class="text-center">
          <div class="text-6xl mb-4">🎉</div>
          <h2 class="text-4xl font-head mb-4">Congratulations!</h2>
          <p class="text-lg font-sans mb-6">
            Your package with
            <span class="font-bold">{{ itemCount }} items</span> has been saved
            successfully!
          </p>
          <Button class="w-full" @click="emit('close')">Close</Button>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import Button from "@/components/retroui/Button.vue";

defineProps<{
  isOpen: boolean;
  itemCount: number;
}>();

const emit = defineEmits<{ (e: "close"): void }>();
</script>
