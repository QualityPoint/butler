<template>
  <div
    v-if="error"
    :class="`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`"
    role="alert"
  >
    <div class="flex items-start gap-3">
      <AlertCircle class="size-5 text-red-600 mt-0.5 shrink-0" />
      <div class="flex-1">
        <h3 class="text-sm font-semibold text-red-900 mb-1">{{ title }}</h3>
        <div class="text-sm text-red-800">
          <ul
            v-if="errorMessages.length > 1"
            class="list-disc list-inside space-y-1"
          >
            <li v-for="(msg, idx) in errorMessages" :key="idx">
              {{ msg.message }}
            </li>
          </ul>
          <p v-else>{{ errorMessage }}</p>
        </div>
      </div>
      <button
        v-if="onDismiss"
        class="text-red-600 hover:text-red-800 transition-colors"
        aria-label="Dismiss error"
        @click="onDismiss"
      >
        <svg
          class="size-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            :stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle } from "lucide-vue-next";
import type { FrappeError } from "@/lib/errorHandler";
import { extractErrorMessage } from "@/lib/errorHandler";

interface ParsedErrorMessage {
  message: string;
  title?: string;
  indicator?: string;
}

const props = withDefaults(
  defineProps<{
    error?: FrappeError | null;
    title?: string;
    className?: string;
    onDismiss?: () => void;
  }>(),
  { title: "Error", className: "" },
);

const errorMessage = computed(() =>
  props.error ? extractErrorMessage(props.error) : "",
);

const errorMessages = computed<ParsedErrorMessage[]>(() => {
  const error = props.error;
  if (!error) return [];

  let messages: ParsedErrorMessage[] = [];

  if (error._server_messages) {
    try {
      const parsed = JSON.parse(error._server_messages);
      messages = parsed.map((m: unknown) => {
        try {
          return typeof m === "string" ? JSON.parse(m) : m;
        } catch {
          return { message: m as string };
        }
      });
    } catch {
      // ignore parsing errors
    }
  }

  if (messages.length === 0 && error.exception) {
    const indexOfFirstColon = error.exception.indexOf(":");
    if (indexOfFirstColon !== -1) {
      const message = error.exception.slice(indexOfFirstColon + 1).trim();
      messages = [{ message, title: "Error" }];
    }
  }

  if (messages.length === 0) {
    messages = [
      {
        message: error.message || "An error occurred",
        title: "Error",
        indicator: "red",
      },
    ];
  }

  return messages;
});
</script>
