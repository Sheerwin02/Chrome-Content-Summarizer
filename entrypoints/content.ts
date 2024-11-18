import "./sidebar.css";
import { marked } from "marked";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script loaded.");

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
    

    let isDarkMode = true; // Default to dark mode

    async function displaySummary(summary: string, takeaways: string[], mode: string) {
      let sidebar = document.getElementById("summarySidebar");
      if (!sidebar) {
        sidebar = createSidebar();
        document.body.appendChild(sidebar);
        console.log("Sidebar created and appended to DOM.");
      } else {
        console.log("Sidebar already exists.");
      }
    
      const contentArea = document.getElementById("summaryContent");
      if (contentArea) {
        try {
          // Render only the summary in the contentArea
          const renderedContent = await marked.parse(summary);
          contentArea.innerHTML = renderedContent;
    
          contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333"; // Update font color based on mode
        } catch (error) {
          console.error("Error rendering content:", error);
          contentArea.innerHTML = `<p>${escapeHTML(summary)}</p>`;
        }
      }
    
      // Store the key takeaways in Chrome storage for later use
      chrome.storage.sync.set({ lastTakeaways: takeaways }, () => {
        console.log("Key takeaways stored successfully.");
      });
    
      // Update the mode indicator
      const modeIndicator = document.getElementById("modeIndicator");
      if (modeIndicator) {
        modeIndicator.innerText = `Current Mode: ${mode || "Not set"}`;
      }
    }
    
    function escapeHTML(str: string): string {
      const div = document.createElement("div");
      div.innerText = str;
      return div.innerHTML;
    }    
    
    function createSidebar() {
      const sidebar = document.createElement("div");
      sidebar.id = "summarySidebar";
      sidebar.className = isDarkMode ? "dark-sidebar" : "light-sidebar";

      const header = createSidebarHeader();
      const contentArea = createContentArea();
      const footer = createSidebarFooter();

      sidebar.appendChild(header);
      sidebar.appendChild(contentArea);
      sidebar.appendChild(footer);

      return sidebar;
    }

    function createSidebarHeader() {
      const header = document.createElement("div");
      header.className = `sidebar-header ${isDarkMode ? "dark" : "light"}`;

      const headerTitle = document.createElement("h2");
      headerTitle.className = "header-title";
      headerTitle.innerText = "Summary";

      const headerButtons = document.createElement("div");
      headerButtons.className = "header-buttons";

      // Mode Selector Dropdown
      const modeSelector = document.createElement("select");
      modeSelector.className = `mode-selector ${isDarkMode ? "dark" : "light"}`;
      const modes = ["brief", "detailed", "bullet_points"];
      modes.forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1).replace("_", " ");
        modeSelector.appendChild(option);
      });

      chrome.storage.sync.get("summarizeMode", (data) => {
        modeSelector.value = data.summarizeMode || "brief";
      });

      modeSelector.addEventListener("change", () => {
        const selectedMode = modeSelector.value;
        chrome.storage.sync.set({ summarizeMode: selectedMode }, () => {
          showInAppNotification(`Switched to ${selectedMode} mode`);
        });
      });

      // Theme Toggle Button
      const themeToggleButton = document.createElement("button");
      themeToggleButton.className = "header-button theme-toggle";
      themeToggleButton.innerHTML = isDarkMode ? "🌙" : "☀️";
      themeToggleButton.onclick = () => toggleTheme(themeToggleButton);

      // Minimize Button
      const minimizeButton = document.createElement("button");
      minimizeButton.className = "header-button minimize-button";
      minimizeButton.innerText = "−";
      minimizeButton.onclick = toggleSidebar;

      headerButtons.appendChild(modeSelector);
      headerButtons.appendChild(themeToggleButton);
      headerButtons.appendChild(minimizeButton);

      header.appendChild(headerTitle);
      header.appendChild(headerButtons);

      return header;
    }

    function toggleTheme(themeToggleButton: HTMLButtonElement) {
      isDarkMode = !isDarkMode;
      themeToggleButton.innerHTML = isDarkMode ? "🌙" : "☀️";

      const sidebar = document.getElementById("summarySidebar");
      const contentArea = document.getElementById("summaryContent");

      if (sidebar) {
        sidebar.className = isDarkMode ? "dark-sidebar" : "light-sidebar";
      }

      if (contentArea) {
        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333";
      }

      const headerTitle = sidebar?.querySelector("h2");
      if (headerTitle) {
        headerTitle.className = isDarkMode ? "dark-title" : "light-title";
      }
    }

    function toggleSidebar() {
      const sidebar = document.getElementById("summarySidebar");
      const minimizedIcon = document.getElementById("minimizedSidebarIcon");

      if (sidebar) {
        sidebar.style.display = "none";
        if (!minimizedIcon) {
          createMinimizedIcon();
        } else {
          minimizedIcon.style.display = "flex";
        }
      }
    }

    function createMinimizedIcon() {
      let minimizedIcon = document.getElementById("minimizedSidebarIcon");
    
      // Only create the icon if it doesn’t already exist
      if (!minimizedIcon) {
        minimizedIcon = document.createElement("div");
        minimizedIcon.id = "minimizedSidebarIcon";
        minimizedIcon.className = isDarkMode ? "dark-minimized-icon" : "light-minimized-icon";
    
        minimizedIcon.innerHTML = `<span style="font-size: 22px;">☰</span>`;
        minimizedIcon.onclick = () => restoreSidebar(); // Add restore behavior
    
        document.body.appendChild(minimizedIcon);
      }
    }

    function restoreSidebar() {
      const sidebar = document.getElementById("summarySidebar");
      const minimizedIcon = document.getElementById("minimizedSidebarIcon");
    
      if (sidebar) {
        sidebar.style.display = "flex";
      }
    
      if (minimizedIcon) {
        minimizedIcon.style.display = "none";
      }
    }

    function createContentArea() {
      const contentArea = document.createElement("div");
      contentArea.id = "summaryContent";
      contentArea.className = "content-area";

      return contentArea;
    }
    
    function createSidebarFooter() {
      const footer = document.createElement("div");
      footer.className = `sidebar-footer ${isDarkMode ? "dark" : "light"}`;
    
      const copyButton = document.createElement("button");
      copyButton.className = "copy-btn";
      copyButton.innerText = "Copy";
      copyButton.onclick = copySummaryToClipboard;
    
      const tryAgainButton = document.createElement("button");
      tryAgainButton.className = "try-again-btn";
      tryAgainButton.innerText = "Try Again";
      tryAgainButton.onclick = regenerateSummary;
    
      const viewTakeawaysButton = document.createElement("button");
      viewTakeawaysButton.className = "view-takeaways-btn";
      viewTakeawaysButton.innerText = "View Key Takeaways";
      viewTakeawaysButton.onclick = () => {
        // Dynamically load and show the modal with key takeaways
        chrome.storage.sync.get("lastTakeaways", (data) => {
          const takeaways = data.lastTakeaways || [];
          if (takeaways.length > 0) {
            showKeyTakeawaysModal(takeaways);
          } else {
            showInAppNotification("No key takeaways available.");
          }
        });
      };
    
      footer.appendChild(copyButton);
      footer.appendChild(tryAgainButton);
      footer.appendChild(viewTakeawaysButton);
    
      return footer;
    }
    
    function copySummaryToClipboard() {
      const contentArea = document.getElementById("summaryContent");
      if (contentArea) {
        const text = contentArea.innerText;
        navigator.clipboard.writeText(text).then(() => {
          showInAppNotification("Summary copied!");
        }).catch((error) => {
          console.error("Failed to copy text: ", error);
        });
      }
    }

    function regenerateSummary() {
      chrome.storage.sync.get(["summarizeMode", "lastHighlightedText"], (data) => {
        const mode = data.summarizeMode || "brief";
        const textToSummarize = data.lastHighlightedText || "";
    
        if (!textToSummarize) {
          showInAppNotification("No text available to regenerate the summary.");
          return;
        }
    
        chrome.runtime.sendMessage(
          { command: "summarize", mode, text: textToSummarize },
          (response) => {
            if (response.summary) {
              displaySummary(response.summary, response.takeaways, mode);
            } else if (response.error) {
              showInAppNotification("Failed to regenerate summary");
            }
          }
        );
      });
    }    

    function showKeyTakeawaysModal(takeaways: string[]) {
      // Remove existing modal if any
      const existingModal = document.getElementById("keyTakeawaysModal");
      if (existingModal) {
        existingModal.remove();
      }
    
      // Create modal container
      const modal = document.createElement("div");
      modal.id = "keyTakeawaysModal";
      modal.className = "modal-overlay";
    
      // Modal content
      modal.innerHTML = `
        <div class="modal-content">
          <h3>Key Takeaways</h3>
          <div class="modal-takeaways">
            ${takeaways
              .map(
                (takeaway) => `
                <div class="modal-tip">
                  <span class="tip-icon">💡</span>${escapeHTML(takeaway)}
                </div>
              `
              )
              .join("")}
          </div>
          <button class="modal-close">Close</button>
        </div>
      `;
    
      // Add close functionality
      modal.querySelector(".modal-close")?.addEventListener("click", () => {
        modal.remove();
      });
    
      // Append modal to body
      document.body.appendChild(modal);
    }
    
    function showInAppNotification(message: string) {
      const toast = document.createElement("div");
      toast.className = "in-app-toast";
      toast.innerText = message;

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.classList.add("show");
      }, 50);

      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  },
});
