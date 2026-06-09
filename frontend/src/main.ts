import "./index.css";
import "./App.css";

import { createApp } from "vue";
import { setConfig } from "@frappeui/config";
import { frappeRequest } from "@frappeui/request";

import App from "./App.vue";
import router from "./router";

const app = createApp(App);

// Route all frappe-ui resources through frappeRequest (uses window.csrf_token).
setConfig("resourceFetcher", frappeRequest);

app.use(router);
app.mount("#app");
