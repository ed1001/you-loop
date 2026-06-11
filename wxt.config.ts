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
    host_permissions: ["https://www.youtube.com/*"],
    // Firefox-only (ignored by Chrome): declare that the extension collects no
    // user data, satisfying AMO's data-consent requirement for new add-ons.
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: { required: ["none"] }
      }
    }
  }
});
