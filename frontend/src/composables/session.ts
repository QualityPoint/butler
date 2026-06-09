/**
 * Session / auth composable — replaces `useFrappeAuth` + `UserContext`.
 *
 * State is module-scoped so every component shares the same reactive session
 * (the Vue equivalent of the React context provider).
 */
import { createResource } from "@frappeui/resources";
import { computed, ref } from "vue";

const currentUser = ref<string>("");
const isLoading = ref<boolean>(true);
let initialized = false;

const userResource = createResource({
  url: "frappe.auth.get_logged_user",
  onSuccess(user: string) {
    currentUser.value = user || "";
    isLoading.value = false;
  },
  onError() {
    currentUser.value = "";
    isLoading.value = false;
  },
});

function loadUser() {
  isLoading.value = true;
  return userResource.reload();
}

/**
 * Log in with username/password — equivalent to frappe-react-sdk `login`.
 * Hits `/api/method/login`, then refreshes the current user.
 */
async function login(payload: { username: string; password: string }) {
  const resource = createResource({ url: "login" });
  await resource.submit({ usr: payload.username, pwd: payload.password });
  await loadUser();
  return currentUser.value;
}

/** Log out — equivalent to frappe-react-sdk `logout`. */
async function logout() {
  const resource = createResource({ url: "logout" });
  await resource.submit();
  currentUser.value = "";
  // Full reload so the backend session/cookies reset cleanly.
  window.location.href = "/login";
}

export function useSession() {
  if (!initialized) {
    initialized = true;
    loadUser();
  }
  return {
    currentUser: computed(() => currentUser.value),
    isLoading: computed(() => isLoading.value),
    isLoggedIn: computed(
      () => !!currentUser.value && currentUser.value !== "Guest",
    ),
    login,
    logout,
    reloadUser: loadUser,
  };
}
