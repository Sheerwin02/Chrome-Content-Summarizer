import { copySummaryToClipboard } from "@/utils/helpers";
import { showKeyTakeawaysModal } from "./PromptModal";
import { showInAppNotification } from "@/utils/notifications";
import { regenerateSummary } from "@/utils/summary";
import "./sidebar.css";

let isDarkMode = true; // Default to dark mode

export function createSidebarFooter() {
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