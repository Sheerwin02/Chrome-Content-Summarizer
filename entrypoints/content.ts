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

    async function displaySummary(
      summary: string,
      takeaways: string[],
      mode: string
    ) {
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

      // Update contentArea color for dark/light mode
      if (contentArea) {
        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333";
      }

      // Update the mode indicator and other elements to match the new theme
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
        minimizedIcon.className = isDarkMode
          ? "dark-minimized-icon"
          : "light-minimized-icon";

        minimizedIcon.innerHTML = `<span style="font-size: 22px;">☰</span>`;
        minimizedIcon.onclick = () => restoreSidebar(); // Add restore behavior

        document.body.appendChild(minimizedIcon);

        // Add drag-and-drop functionality
        addDragFunctionalityToIcon(minimizedIcon);

        // Ensure the icon is visible
        minimizedIcon.style.visibility = "visible";
      }
    }

    function addDragFunctionalityToIcon(icon: HTMLElement) {
      let isDragging = false;
      let startX: number, startY: number, initialX: number, initialY: number;

      // Mouse Down Event: Start dragging
      icon.addEventListener("mousedown", (event) => {
        isDragging = true;
        icon.classList.add("dragging");

        // Record the initial positions
        startX = event.clientX;
        startY = event.clientY;

        const rect = icon.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        event.preventDefault(); // Prevent text selection
      });

      // Mouse Move Event: Update position dynamically
      document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        // Calculate the new position
        const deltaX: number = event.clientX - startX;
        const deltaY = event.clientY - startY;

        // Constrain to viewport boundaries
        const newX = Math.max(
          0,
          Math.min(window.innerWidth - icon.offsetWidth, initialX + deltaX)
        );
        const newY = Math.max(
          0,
          Math.min(window.innerHeight - icon.offsetHeight, initialY + deltaY)
        );

        // Update the position of the icon
        icon.style.left = `${newX}px`;
        icon.style.top = `${newY}px`;
        icon.style.position = "fixed"; // Ensure it stays in the viewport
      });

      // Mouse Up Event: Stop dragging
      document.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          icon.classList.remove("dragging");
        }
      });
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
      uploadButton.innerText = "+";
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
                displaySummary(
                  response.summary,
                  response.takeaways,
                  "uploaded"
                );
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

      footer.className = `sidebar-footer ${isDarkMode ? "dark" : "light"}`;

      const copyButton = document.createElement("button");
      copyButton.className = "copy-btn";
      copyButton.innerText = "Copy";
      copyButton.onclick = copySummaryToClipboard;

      const tryAgainButton = document.createElement("button");
      tryAgainButton.className = "try-again-btn";
      tryAgainButton.innerText = "Try Again";
      tryAgainButton.onclick = regenerateSummary;

      footer.appendChild(uploadButton);

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

    async function showKeyTakeawaysModal(takeaways: string[]) {
      // Remove existing modal if any
      const existingModal = document.getElementById("keyTakeawaysModal");
      if (existingModal) {
        existingModal.remove();
      }

      // Create modal container
      const modal = document.createElement("div");
      modal.id = "keyTakeawaysModal";
      modal.className = "modal-overlay";

      // Process key takeaways as Markdown
      const renderedTakeaways = await Promise.all(
        takeaways.map((takeaway) => marked.parse(takeaway))
      );

      // Modal content
      modal.innerHTML = `
        <div class="modal-content">
          <h3 style="font-family: 'San Francisco', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">Key Takeaways</h3>
          <div class="modal-takeaways">
            ${renderedTakeaways
              .map(
                (takeaway) => `
                <div class="modal-tip">
                  <span class="tip-icon">💡</span>
                  <div class="markdown-content">${takeaway}</div>
                </div>
              `
              )
              .join("")}
          </div>
          <div class="modal-footer">
            <button class="copy-btn">Copy</button>
            <button class="modal-close">Close</button>
          </div>
        </div>
      `;

      // Add functionality to the copy button
      modal.querySelector(".copy-btn")?.addEventListener("click", () => {
        const plainTextTakeaways = takeaways.join("\n\n"); // Convert to plain text for copying
        navigator.clipboard
          .writeText(plainTextTakeaways)
          .then(() => {
            showInAppNotification("Key takeaways copied to clipboard!");
          })
          .catch((error) => {
            console.error("Failed to copy key takeaways:", error);
            showInAppNotification("Failed to copy key takeaways.");
          });
      });

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
        toast.style.opacity = "1";
      }, 50);
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, 3000);
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
      chrome.storage.sync.get(
        ["summarizeMode", "lastHighlightedText"],
        (data) => {
          const mode = data.summarizeMode || "brief";
          const textToSummarize = data.lastHighlightedText || "";

          if (!textToSummarize) {
            showInAppNotification(
              "No text available to regenerate the summary."
            );
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
        }
      );
    }
  },
});
