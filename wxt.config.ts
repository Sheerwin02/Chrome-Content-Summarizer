import { defineConfig } from "wxt";

export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  entrypointsDir: "entrypoints", // the directory where your main scripts are located

  manifest: {
    permissions: [
      "contextMenus",
      "activeTab",
      "scripting",
      "tabs",
      "storage",
      "notifications",
    ],
    host_permissions: ["<all_urls>"],
    content_scripts: [
      {
        matches: ["<all_urls>"], // Specify the URLs where the content script should run
        js: ["content-scripts/content.js"], // Adjust this path based on the actual output location
        run_at: "document_idle",
      },
    ],
    origin_trial_tokens: {
      translation: import.meta.env.VITE_TRANSLATE_API_KEY,
    },

    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      96: "icon/96.png",
      128: "icon/128.png",
    },
  },
});
