import { showInAppNotification } from "@/utils/notifications";
import { showCustomizePromptModal } from "./PromptModal";
import { createMinimizedIcon } from "./MinimizedIcon";
import "./sidebar.css";

let isDarkMode = true; // Default to dark mode

export function createSidebarHeader() {
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
  const modes = ["brief", "detailed", "bullet_points", "customize"];
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
      if (selectedMode === "customize") {
        showCustomizePromptModal();
      }
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
