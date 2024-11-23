import "./sidebar.css";
import { marked } from "marked";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    
    let isDarkMode = true; // Default to dark mode

    console.log("Content script loaded.");

    // createMinimizedIcon();
  
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
        showLoading(); // Show loading spinner while rendering content
        contentArea.innerHTML = ""; // Clear existing content
    
        if (summary.trim() === "") {
          // Add placeholder if no summary is provided
          contentArea.innerHTML = `
            <div class="placeholder">
              <p>No summary available yet. Highlight some text and summarize!</p>
            </div>`;
          console.log("Placeholder added to content area.");
        } else {
          try {
            // Render summary content
            const renderedContent = await marked.parse(summary);
            contentArea.innerHTML = renderedContent;
            contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333"; // Update font color
          } catch (error) {
            console.error("Error rendering content:", error);
            contentArea.innerHTML = `<p>${escapeHTML(summary)}</p>`;
          }
        }
        // Hide the loading spinner
        hideLoading();        
      }
    
      chrome.storage.sync.set({ lastTakeaways: takeaways }, () => {
        console.log("Key takeaways stored successfully.");
      });
    
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
    
    function getFullPageText() {
      // Fetch all visible text from the body of the page
      const bodyText = document.body.innerText || document.body.textContent || "";
      return bodyText.trim();
    }

    function truncateText(text: string, maxLength = 10000) {
      if (text.length > maxLength) {
        console.warn(`Text length exceeds ${maxLength} characters. Truncating.`);
        return text.slice(0, maxLength) + "...";
      }
      return text;
    }
    
    function createSidebar() {
      console.log("Creating sidebar...");
      const sidebar = document.createElement("div");
      sidebar.id = "summarySidebar";
      sidebar.className = isDarkMode ? "dark-sidebar" : "light-sidebar";
    
      const header = createSidebarHeader();
      const contentArea = createContentArea();
      const footer = createSidebarFooter();

      const spinner = document.createElement("div");
      spinner.id = "loadingSpinner";
      spinner.className = "loading-spinner";
    
      contentArea.innerHTML = `
        <div class="placeholder">
          <p>No summary available yet. Highlight some text and summarize!</p>
        </div>`;
    
      sidebar.appendChild(header);
      sidebar.appendChild(contentArea);
      sidebar.appendChild(spinner);
      sidebar.appendChild(footer);
    
      console.log("Sidebar created.");
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
        const isSidebarVisible = sidebar.style.display !== "none";
    
        // Toggle visibility
        if (isSidebarVisible) {
          sidebar.style.display = "none";
          if (!minimizedIcon) {
            createMinimizedIcon();
          } else {
            minimizedIcon.style.display = "flex";
          }
          chrome.storage.sync.set({ sidebarVisible: false }, () => {
            console.log("Sidebar hidden, minimized icon visible.");
          });
        } else {
          sidebar.style.display = "flex";
          if (minimizedIcon) {
            minimizedIcon.style.display = "none";
          }
    
          // Add placeholder if no content exists
          const contentArea = document.getElementById("summaryContent");
          if (contentArea && contentArea.innerHTML.trim() === "") {
            contentArea.innerHTML = `
              <div class="placeholder">
                <p>No summary available yet. Highlight some text and summarize!</p>
              </div>`;
            console.log("Added placeholder during sidebar restoration.");
          }
    
          chrome.storage.sync.set({ sidebarVisible: true }, () => {
            console.log("Sidebar visible, minimized icon hidden.");
          });
        }
      } else {
        console.error("Sidebar element not found.");
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

        // Set initial position at the top-right corner
        minimizedIcon.style.position = "fixed";
        minimizedIcon.style.top = "10px";
        minimizedIcon.style.right = "10px";
        minimizedIcon.style.zIndex = "1000";

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
        const newX = Math.max(0, Math.min(window.innerWidth - icon.offsetWidth, initialX + deltaX));
        const newY = Math.max(0, Math.min(window.innerHeight - icon.offsetHeight, initialY + deltaY));
    
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
      let sidebar = document.getElementById("summarySidebar");
      if (!sidebar) {
        console.warn("Sidebar not found during restoration. Creating sidebar.");
        sidebar = createSidebar();
        document.body.appendChild(sidebar);
      }
    
      sidebar.style.display = "flex";
    
      const contentArea = document.getElementById("summaryContent");
      if (contentArea && contentArea.innerHTML.trim() === "") {
        contentArea.innerHTML = `
          <div class="placeholder">
            <p>No summary available yet. Highlight some text and summarize!</p>
          </div>`;
      }
    
      const minimizedIcon = document.getElementById("minimizedSidebarIcon");
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
        let textToSummarize = data.lastHighlightedText || "";
    
        if (!textToSummarize) {
          // Fetch full-page text if no highlighted text is available
          textToSummarize = getFullPageText();
          if (!textToSummarize) {
            showInAppNotification("No text available to regenerate the summary.");
            return;
          }
          console.log("Full page text fetched for summarization:", textToSummarize);
        }
    
        // Truncate large text for API
        textToSummarize = truncateText(textToSummarize);
    
        // Show the loading spinner
        showLoading();
    
        // Send the text to the summarization service
        chrome.runtime.sendMessage(
          { command: "summarize", mode, text: textToSummarize },
          (response) => {
            hideLoading(); // Hide the spinner after receiving a response
    
            if (response?.summary) {
              displaySummary(response.summary, response.takeaways || [], mode);
            } else if (response?.error) {
              console.error("Summarization failed:", response.error);
              showInAppNotification("Failed to regenerate summary");
            } else {
              console.error("Unexpected response:", response);
              showInAppNotification("Unexpected error occurred.");
            }
          }
        );
      });
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
        navigator.clipboard.writeText(plainTextTakeaways)
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
        toast.classList.add("show");
      }, 50);

      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    function showLoading() {
      const spinner = document.getElementById("loadingSpinner");
      if (spinner) {
        spinner.classList.add("visible");
      }
    }
    
    function hideLoading() {
      const spinner = document.getElementById("loadingSpinner");
      if (spinner) {
        spinner.classList.remove("visible");
      }
    }
    
  },
});
