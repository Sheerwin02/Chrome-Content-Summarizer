import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  entrypointsDir: 'entrypoints', // the directory where your main scripts are located

  manifest: {
    permissions: [
      "contextMenus",
      "activeTab",
      "scripting",
      "tabs"
    ],
    host_permissions: [
      "https://generativelanguage.googleapis.com/"
    ],
    content_scripts: [
      {
        matches: ["<all_urls>"], // Specify the URLs where the content script should run
        js: ["content-scripts/content.js"] // Adjust this path based on the actual output location
      }
    ]
  }
});
