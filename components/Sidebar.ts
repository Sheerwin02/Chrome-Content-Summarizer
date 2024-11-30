import { createSidebarHeader } from "./SidebarHeader";
import { createContentArea } from "./ContentArea";
import { createCustomizePromptModal } from "./PromptModal";
import { createSidebarFooter } from "./SidebarFooter";
import "./sidebar.css";

let isDarkMode = true; // Default to dark mode

export function createSidebar() {
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

    const customizeModal = createCustomizePromptModal();
  
    contentArea.innerHTML = `
      <div class="placeholder">
        <p>No summary available yet. Highlight some text and summarize!</p>
      </div>`;
  
    sidebar.appendChild(header);
    sidebar.appendChild(contentArea);
    sidebar.appendChild(spinner);
    sidebar.appendChild(customizeModal);
    sidebar.appendChild(footer);
  
    console.log("Sidebar created.");
    return sidebar;
}

export function restoreSidebar() {
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
}
