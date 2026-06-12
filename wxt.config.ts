import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: {
    disabled: true
  },
  manifest: {
    name: "Étude — Loop & Slow Down YouTube for Practice",
    short_name: "Étude",
    description: "Practice tools for YouTube — loop a section, slow it down, zoom in for precision. Made for musicians learning by ear.",
    permissions: ["storage"],
    host_permissions: ["https://www.youtube.com/*"],
    // The wordmark font is loaded by the page (document.head @font-face), so
    // it must be web-accessible to YouTube.
    web_accessible_resources: [
      { resources: ["fonts/*"], matches: ["https://www.youtube.com/*"] }
    ],
    // Firefox-only (ignored by Chrome): declare that the extension collects no
    // user data, satisfying AMO's data-consent requirement for new add-ons.
    browser_specific_settings: {
      gecko: {
        // Required for MV3 on AMO (Chrome ignores browser_specific_settings).
        id: "etude@ed1001.dev",
        data_collection_permissions: { required: ["none"] }
      }
    }
  }
});
