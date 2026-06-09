<template>
  <div
    v-if="error"
    :class="`flex items-center gap-2 text-sm text-red-600 ${className}`"
  >
    <AlertCircle class="size-4 shrink-0" />
    <span>{{ errorMessage }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle } from "lucide-vue-next";
import type { FrappeError } from "@/lib/errorHandler";
import { extractErrorMessage } from "@/lib/errorHandler";

const props = withDefaults(
  defineProps<{ error?: FrappeError | null; className?: string }>(),
  { className: "" },
);

const errorMessage = computed(() =>
  props.error ? extractErrorMessage(props.error) : "",
);
</script>
