export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script loaded.");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "displaySummary") {
        displaySummary(request.summary, request.mode);
      }
    });

    let isDarkMode = true; // Default to dark mode

    function displaySummary(summary: string, mode: string) {
      let sidebar = document.getElementById("summarySidebar");
      if (!sidebar) {
        sidebar = createSidebar();
        document.body.appendChild(sidebar);
      }

      const contentArea = document.getElementById("summaryContent");
      if (contentArea) {
        contentArea.innerHTML = `<p>${summary}</p>`;
        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333"; // Update font color based on mode
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
        background-color: ${isDarkMode ? "#1e1e1e" : "#F5F5F7"};
        border-left: 1px solid ${isDarkMode ? "#333" : "#DDD"};
        box-shadow: -2px 0px 15px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        transition: transform 0.3s ease;
        color: ${isDarkMode ? "#F0F0F0" : "#333"};
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
        padding: 15px 20px;
        background-color: ${
          isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.95)"
        };
        border-bottom: 1px solid ${isDarkMode ? "#444" : "#DDD"};
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const headerTitle = document.createElement("h2");
      headerTitle.innerText = "Summary";
      headerTitle.style.cssText = `
        font-size: 18px;
        margin: 0;
        color: ${isDarkMode ? "#ffcc00" : "#333"};
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      `;

      // Mode Selector
      const modeSelector = document.createElement("select");
      modeSelector.style.cssText = `
        background-color: ${isDarkMode ? "#333" : "#EEE"};
        color: ${isDarkMode ? "#fff" : "#333"};
        border: none;
        padding: 5px;
        font-size: 14px;
        border-radius: 8px;
        font-family: inherit;
        cursor: pointer;
      `;
      const modes = ["brief", "detailed", "bullet_points"];
      modes.forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent =
          mode.charAt(0).toUpperCase() + mode.slice(1).replace("_", " ");
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

      // Dark Mode Toggle Button
      const themeToggleButton = document.createElement("button");
      themeToggleButton.innerHTML = isDarkMode ? "🌙" : "☀️";
      themeToggleButton.style.cssText = `
        background: none;
        border: none;
        color: ${isDarkMode ? "#ffcc00" : "#333"};
        font-size: 20px;
        cursor: pointer;
        margin-left: 10px;
      `;
      themeToggleButton.onclick = () => toggleTheme(themeToggleButton);

      // Minimize Button
      const minimizeButton = document.createElement("button");
      minimizeButton.innerText = "−";
      minimizeButton.style.cssText = `
        background: none;
        border: none;
        color: ${isDarkMode ? "#ffcc00" : "#333"};
        font-size: 20px;
        cursor: pointer;
        margin-left: 10px;
      `;
      minimizeButton.onclick = () => toggleSidebar();

      header.appendChild(headerTitle);
      header.appendChild(modeSelector);
      header.appendChild(themeToggleButton);
      header.appendChild(minimizeButton);

      return header;
    }

    function toggleTheme(themeToggleButton: HTMLButtonElement) {
      isDarkMode = !isDarkMode;
      themeToggleButton.innerHTML = isDarkMode ? "🌙" : "☀️";

      const sidebar = document.getElementById("summarySidebar");
      const contentArea = document.getElementById("summaryContent");

      if (sidebar) {
        sidebar.style.backgroundColor = isDarkMode ? "#1e1e1e" : "#F5F5F7";
        sidebar.style.borderLeftColor = isDarkMode ? "#333" : "#DDD";
      }

      // Update contentArea color for dark/light mode
      if (contentArea) {
        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333";
      }

      // Update the mode indicator and other elements to match the new theme
      const headerTitle = sidebar?.querySelector("h2");
      if (headerTitle) {
        headerTitle.style.color = isDarkMode ? "#ffcc00" : "#333";
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
      const minimizedIcon = document.createElement("div");
      minimizedIcon.id = "minimizedSidebarIcon";
      minimizedIcon.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 45px;
        height: 45px;
        background-color: ${isDarkMode ? "#333" : "#DDD"};
        color: ${isDarkMode ? "#fff" : "#333"};
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        z-index: 10001;
      `;
      minimizedIcon.innerHTML = `<span style="font-size: 22px;">☰</span>`;
      minimizedIcon.onclick = () => restoreSidebar();

      document.body.appendChild(minimizedIcon);
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
      contentArea.style.cssText = `
        padding: 15px 20px;
        overflow-y: auto;
        flex-grow: 1;
        font-size: 15px;
        line-height: 1.6;
        color: ${isDarkMode ? "#F0F0F0" : "#333"};
      `;
      return contentArea;
    }

    function createSidebarFooter() {
      const footer = document.createElement("div");
      footer.style.cssText = `
        padding: 15px;
        border-top: 1px solid ${isDarkMode ? "#444" : "#DDD"};
        background-color: ${
          isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.9)"
        };
        display: flex;
        justify-content: space-around;
      `;

      const uploadButton = document.createElement("button");
      uploadButton.innerText = "Upload";
      uploadButton.style.cssText = `
        background-color: ${isDarkMode ? "#007AFF" : "#1A73E8"};
        color: #fff;
        border: none;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        border-radius: 12px;
      `;
      uploadButton.onclick = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".txt,.pdf,.docx";
        input.onchange = (event: Event) => {
          console.log("File input triggered");
          const target = event.target as HTMLInputElement;
          if (target.files && target.files[0]) {
            console.log("File selected:", target.files[0]);
            uploadDocument(target.files[0]);
          } else {
            console.log("No file selected");
          }
        };
        input.click();
      };

      const copyButton = document.createElement("button");
      copyButton.innerText = "Copy";
      copyButton.style.cssText = `
        background-color: ${isDarkMode ? "#007AFF" : "#1A73E8"};
        color: #fff;
        border: none;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        border-radius: 12px;
      `;
      copyButton.onclick = copySummaryToClipboard;

      const tryAgainButton = document.createElement("button");
      tryAgainButton.innerText = "Try Again";
      tryAgainButton.style.cssText = `
        background-color: ${isDarkMode ? "#FF9500" : "#FB8C00"};
        color: #fff;
        border: none;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        border-radius: 12px;
      `;
      tryAgainButton.onclick = regenerateSummary;

      footer.appendChild(uploadButton);
      footer.appendChild(copyButton);
      footer.appendChild(tryAgainButton);

      return footer;
    }

    function copySummaryToClipboard() {
      const contentArea = document.getElementById("summaryContent");
      if (contentArea) {
        const text = contentArea.innerText;
        navigator.clipboard
          .writeText(text)
          .then(() => {
            showInAppNotification("Summary copied!");
          })
          .catch((error) => {
            console.error("Failed to copy text: ", error);
          });
      }
    }

    function regenerateSummary() {
      chrome.storage.sync.get("summarizeMode", (data) => {
        const mode = data.summarizeMode || "brief";
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

    function showInAppNotification(message: string) {
      const toast = document.createElement("div");
      toast.className = "in-app-toast";
      toast.innerText = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: ${isDarkMode ? "#333" : "#F5F5F5"};
        color: ${isDarkMode ? "#fff" : "#333"};
        padding: 10px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
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

    let isProcessing = false; // Flag to prevent multiple uploads

    function uploadDocument(file: Blob) {
      if (isProcessing) {
        console.log("Upload already in progress.");
        return; // Prevent further uploads if already processing
      }

      isProcessing = true; // Set flag to true when upload starts

      const reader = new FileReader();

      reader.onload = () => {
        const base64Data = reader.result as string;

        chrome.runtime.sendMessage(
          {
            action: "uploadDocument",
            file: {
              name: (file as File).name,
              type: file.type || "application/pdf",
              data: base64Data, // Send the complete data URL
            },
          },
          (response) => {
            console.log("Response from background:", response);
            if (response && response.success && response.summary) {
              displaySummary(response.summary, "uploaded");
              showInAppNotification(
                "Document uploaded and summarized successfully!"
              );
            } else if (response && !response.success) {
              showInAppNotification(
                `Error: ${response.error}. Please try again.`
              );
            } else {
              showInAppNotification(
                "Failed to process the document. Please try again."
              );
            }

            // Ensure flag is reset only after processing is complete
            isProcessing = false;
          }
        );
      };

      // Reset flag if reading the file fails
      reader.onerror = () => {
        console.log("Error reading file.");
        isProcessing = false; // Reset flag if file reading fails
      };

      // Read file as Data URL (Base64)
      reader.readAsDataURL(file);
    }
  },
});
