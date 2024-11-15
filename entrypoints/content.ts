export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script loaded.");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("Received message in content script:", request);
      if (request.action === "displaySummary") {
        displaySummary(request.summary, request.mode); // Pass mode to display
      }
    });

    function displaySummary(summary: string, mode: string) {
      let sidebar = document.getElementById("summarySidebar");
      if (!sidebar) {
        sidebar = createSidebar();
        document.body.appendChild(sidebar);
      }
    
      const contentArea = document.getElementById("summaryContent");
    
      if (contentArea) {
        if (mode === "bullet_points") {
          // Split the summary by newlines or asterisks to separate each item
          const lines = summary.split(/\*\s+/).filter(line => line.trim() !== "");
    
          contentArea.innerHTML = ""; // Clear any existing content
    
          lines.forEach(line => {
            // Check if line represents a title (contains a colon or specific keywords)
            if (/^[A-Za-z\s]+:$/.test(line.trim())) {
              // Create a bold title element
              const title = document.createElement("div");
              title.style.fontWeight = "bold";
              title.style.marginTop = "15px";
              title.style.marginBottom = "5px";
              title.textContent = line.trim().replace(/:$/, ""); // Remove trailing colon
              contentArea.appendChild(title);
            } else {
              // Create a paragraph element for regular content
              const content = document.createElement("p");
              content.style.margin = "0 0 10px 20px"; // Indent content under the title
              content.innerText = line.trim();
              contentArea.appendChild(content);
            }
          });
        } else {
          // For other modes, display as plain text
          contentArea.innerHTML = `<p style="margin-bottom: 15px;">${summary}</p>`;
        }
      }
    
      const modeIndicator = document.getElementById("modeIndicator");
      if (modeIndicator) {
        modeIndicator.innerText = `Current Mode: ${mode || "Not set"}`;
      }
    }    

    function createSidebar() {
      const sidebar = document.createElement("div");
      sidebar.id = "summarySidebar";
      sidebar.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 350px;
        height: 100%;
        background-color: #1e1e1e;
        border-left: 2px solid #333;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        font-family: Arial, sans-serif;
        transition: transform 0.3s ease;
        color: #f0f0f0;
      `;

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
      header.style.cssText = `
        padding: 20px;
        background-color: #333;
        color: #f0f0f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #444;
      `;
    
      const headerTitle = document.createElement("h2");
      headerTitle.innerText = "Summary";
      headerTitle.style.cssText = `
        font-size: 20px;
        margin: 0;
        color: #ffcc00;
      `;
    
      // Create mode selector dropdown
      const modeSelector = document.createElement("select");
      modeSelector.style.cssText = `
        background-color: #444;
        color: #fff;
        border: none;
        padding: 5px 10px;
        font-size: 14px;
        border-radius: 5px;
        margin-left: 10px;
        cursor: pointer;
      `;
    
      // Options for the dropdown
      const modes = ["brief", "detailed", "bullet_points"];
      modes.forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1).replace("_", " ");
        modeSelector.appendChild(option);
      });
    
      // Load and set the current mode from storage
      chrome.storage.sync.get("summarizeMode", (data) => {
        modeSelector.value = data.summarizeMode || "brief";
      });
    
      // Update mode in storage when the selection changes
      modeSelector.addEventListener("change", () => {
        const selectedMode = modeSelector.value;
        chrome.storage.sync.set({ summarizeMode: selectedMode }, () => {
          showInAppNotification(`Switched to ${selectedMode} mode`);
        });
      });
    
      const minimizeButton = document.createElement("button");
      minimizeButton.innerText = "−";
      minimizeButton.style.cssText = `
        background: none;
        border: none;
        color: #f0f0f0;
        font-size: 20px;
        cursor: pointer;
        margin-left: 10px;
      `;
      minimizeButton.onclick = () => toggleSidebar();
    
      header.appendChild(headerTitle);
      header.appendChild(modeSelector);
      header.appendChild(minimizeButton);
    
      return header;
    }    

    function toggleSidebar() {
      const sidebar = document.getElementById("summarySidebar");
      const minimizedIcon = document.getElementById("minimizedSidebarIcon");

      if (sidebar) {
        sidebar.style.display = "none"; // Hide the sidebar

        // If minimized icon doesn't exist, create it
        if (!minimizedIcon) {
          createMinimizedIcon();
        } else {
          minimizedIcon.style.display = "flex"; // Show the icon if it was hidden
        }
      }
    }

    function createMinimizedIcon() {
      const minimizedIcon = document.createElement("div");
      minimizedIcon.id = "minimizedSidebarIcon";
      minimizedIcon.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background-color: #333;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
        z-index: 10001;
      `;
      minimizedIcon.innerHTML = `<span style="font-size: 24px;">☰</span>`;
      minimizedIcon.onclick = () => restoreSidebar();

      document.body.appendChild(minimizedIcon);
    }

    function restoreSidebar() {
      const sidebar = document.getElementById("summarySidebar");
      const minimizedIcon = document.getElementById("minimizedSidebarIcon");

      if (sidebar) {
        sidebar.style.display = "flex"; // Show the sidebar
      }

      if (minimizedIcon) {
        minimizedIcon.style.display = "none"; // Hide the minimized icon
      }
    }

    function createContentArea() {
      const contentArea = document.createElement("div");
      contentArea.id = "summaryContent";
      contentArea.style.cssText = `
        padding: 20px;
        overflow-y: auto;
        flex-grow: 1;
        line-height: 1.6;
        font-size: 16px;
        color: #d4d4d4;
      `;
      return contentArea;
    }

    function createSidebarFooter() {
      const footer = document.createElement("div");
      footer.style.cssText = `
        padding: 20px;
        border-top: 1px solid #444;
        background-color: #333;
        display: flex;
        justify-content: space-around;
      `;

      const copyButton = document.createElement("button");
      copyButton.innerText = "Copy to Clipboard";
      copyButton.style.cssText = `
        background-color: #4caf50;
        color: #fff;
        border: none;
        padding: 10px;
        font-size: 14px;
        cursor: pointer;
        border-radius: 5px;
      `;
      copyButton.onclick = copySummaryToClipboard;

      const tryAgainButton = document.createElement("button");
      tryAgainButton.innerText = "Try Again";
      tryAgainButton.style.cssText = `
        background-color: #ff8c00;
        color: #fff;
        border: none;
        padding: 10px;
        font-size: 14px;
        cursor: pointer;
        border-radius: 5px;
      `;
      tryAgainButton.onclick = regenerateSummary;

      footer.appendChild(copyButton);
      footer.appendChild(tryAgainButton);

      return footer;
    }

    function regenerateSummary() {
      chrome.storage.sync.get("summarizeMode", (data) => {
        const mode = data.summarizeMode || "brief";
        
        // Trigger the background script to regenerate the summary
        chrome.runtime.sendMessage(
          { command: "summarize", mode },
          (response) => {
            if (response.summary) {
              displaySummary(response.summary, mode);
            } else if (response.error) {
              showInAppNotification("Failed to regenerate summary");
            }
          }
        );
      });
    }

    function copySummaryToClipboard() {
      const contentArea = document.getElementById("summaryContent");
      if (contentArea) {
        const text = contentArea.innerText;
        navigator.clipboard.writeText(text).then(() => {
          showInAppNotification("Summary copied to clipboard!");
        }).catch((error) => {
          console.error("Failed to copy text: ", error);
        });
      }
    }

    function showInAppNotification(message: string) {
      const toast = document.createElement("div");
      toast.className = "in-app-toast";
      toast.innerText = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #333;
        color: #fff;
        padding: 10px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 10001;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = "1";
      }, 50);

      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  },
});
