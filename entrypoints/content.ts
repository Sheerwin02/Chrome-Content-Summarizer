import { createSidebar } from "@/components/Sidebar";
import { createMinimizedIcon } from "@/components/MinimizedIcon";
import { displaySummary } from "@/utils/summary";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    
    let isDarkMode = true; // Default to dark mode

    console.log("Content script loaded.");

    // Initialize sidebar and minimized icon based on the stored state
    chrome.storage.sync.get("sidebarVisible", (data) => {
      const sidebarVisible = data.sidebarVisible ?? false; 
      // Ensure sidebar is created regardless of visibility
      let sidebar = document.getElementById("summarySidebar");
      if (!sidebar) {
        sidebar = createSidebar();
        document.body.appendChild(sidebar);
        console.log("Sidebar created during initialization.");
      }

      const minimizedIcon = document.getElementById("minimizedSidebarIcon");
  
      if (sidebarVisible) {
        // Show the sidebar and hide the minimized icon
        if (sidebar) {
          sidebar.style.display = "flex";
        }
        if (minimizedIcon) {
          minimizedIcon.style.display = "none";
        }
      } else {
        // Hide the sidebar and ensure the minimized icon is visible
        if (sidebar) {
          sidebar.style.display = "none";
        }
        if (!minimizedIcon) {
          createMinimizedIcon(); // Create the minimized icon if not already present
        } else {
          minimizedIcon.style.display = "flex";
        }
      }
    });
  
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "displaySummary") {
        console.log("Received displaySummary message", request);
  
        // Store key takeaways in chrome storage for later access
        chrome.storage.sync.set({ lastTakeaways: request.takeaways }, () => {
          console.log("Key takeaways stored successfully.");
        });
  
        displaySummary(request.summary, request.takeaways, request.mode);
      }
    });
  },
});