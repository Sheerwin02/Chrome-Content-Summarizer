import { showInAppNotification } from "./notifications";
import { escapeHTML, truncateText, getFullPageText, showLoading, hideLoading } from "./helpers";
import { createSidebar } from "@/components/Sidebar";
import { marked } from "marked";

let isDarkMode = true; // Default to dark mode

export async function displaySummary(summary: string, takeaways: string[], mode: string) {
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

export function regenerateSummary() {
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