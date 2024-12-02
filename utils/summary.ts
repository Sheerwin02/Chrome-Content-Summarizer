import { showInAppNotification } from "./notifications";
import {
  escapeHTML,
  truncateText,
  getFullPageText,
  showLoading,
  hideLoading,
} from "./helpers";
import { createSidebar } from "@/components/Sidebar";
import { marked } from "marked";

let isDarkMode = true; // Default to dark mode

export async function displaySummary(
  summary: string,
  takeaways: string[],
  mode: string
) {
  let sidebar = document.getElementById("summarySidebar");
  if (!sidebar) {
    sidebar = createSidebar();
    document.body.appendChild(sidebar);
  }

  const contentArea = document.getElementById("summaryContent");
  if (!contentArea) {
    hideLoading();
    return;
  }

  try {
    // Show loading before content update
    showLoading();

    // Clear existing content
    contentArea.innerHTML = "";

    if (summary.trim() === "") {
      contentArea.innerHTML = `
        <div class="placeholder">
          <p>No summary available yet. Highlight some text and summarize!</p>
        </div>`;
      return;
    }

    // Render content with a small delay to ensure loading spinner shows
    setTimeout(async () => {
      try {
        const renderedContent = await marked.parse(summary);
        contentArea.innerHTML = renderedContent;
        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333";

        // Store takeaways
        await chrome.storage.sync.set({ lastTakeaways: takeaways });

        // Update mode indicator
        const modeIndicator = document.getElementById("modeIndicator");
        if (modeIndicator) {
          modeIndicator.innerText = `Current Mode: ${mode || "Not set"}`;
        }
      } catch (error) {
        console.error("Error rendering content:", error);
        contentArea.innerHTML = `<p>${escapeHTML(summary)}</p>`;
      } finally {
        hideLoading();
      }
    }, 100);
  } catch (error) {
    console.error("Error in displaySummary:", error);
    showInAppNotification("Error displaying summary");
    hideLoading();
  }
}

export function regenerateSummary() {
  chrome.storage.sync.get(
    ["summarizeMode", "lastHighlightedText"],
    async (data) => {
      const mode = data.summarizeMode || "brief";

      // First check if we're dealing with a document
      const fileState = await chrome.storage.local.get("currentFileState");
      const currentFileState = fileState.currentFileState;

      if (currentFileState) {
        console.log("Document state found, processing document...");
        showLoading();

        // Send document summarize request
        chrome.runtime.sendMessage(
          {
            action: "summarizeDocument",
            mode,
            fileState: currentFileState,
          },
          (response) => {
            hideLoading();

            if (response?.summary) {
              displaySummary(response.summary, response.takeaways || [], mode);
            } else if (response?.error) {
              console.error("Document summarization failed:", response.error);
              showInAppNotification("Failed to regenerate document summary");
            } else {
              console.error("Unexpected response:", response);
              showInAppNotification("Unexpected error occurred.");
            }
          }
        );
        return;
      }

      // If no document, proceed with text summarization
      let textToSummarize = data.lastHighlightedText || "";

      if (!textToSummarize) {
        textToSummarize = getFullPageText();
        if (!textToSummarize) {
          showInAppNotification("No text available to regenerate the summary.");
          return;
        }
        console.log("Full page text fetched for summarization");
      }

      textToSummarize = truncateText(textToSummarize);
      showLoading();

      chrome.runtime.sendMessage(
        {
          action: "summarize",
          mode,
          text: textToSummarize,
        },
        (response) => {
          hideLoading();

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
    }
  );
}
