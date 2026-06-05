import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "You Loop",
    description: "Precise loop and playback-rate controls for YouTube.",
    permissions: ["storage", "tabs"],
    host_permissions: ["https://www.youtube.com/*"],
    action: {
      default_title: "You Loop",
      default_popup: "popup.html"
    }
  }
});
