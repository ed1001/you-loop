import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: {
    disabled: true
  },
  manifest: {
    name: "You Loop",
    description: "Precise loop and playback-rate controls for YouTube.",
    permissions: ["storage"],
    host_permissions: ["https://www.youtube.com/*"]
  }
});
