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
import { translateContent } from "@/apis/translation";

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
      hideLoading();
      return;
    }

    try {
      // Retrieve translation settings
      chrome.storage.sync.get(["sourceLang", "targetLang"], async (data) => {
        const sourceLang = data.sourceLang || "en";
        const targetLang = data.targetLang || "en";

        let finalContent = summary; // Fallback to the original summary

        // Perform translation only if source and target languages differ
        if (sourceLang !== targetLang) {
          showLoading(); // Keep the loader running during translation
          try {
            const translatedText = await translateContent(
              sourceLang,
              targetLang,
              summary
            );
            if (translatedText) {
              finalContent = translatedText; // Use translated content if available
            } else {
              console.warn("Translation failed, using original summary.");
            }
          } catch (translationError) {
            console.error("Error during translation:", translationError);
            showInAppNotification(
              "Translation failed. Displaying the original summary."
            );
          }
          hideLoading(); // Hide the loader after translation
        }

        // Render content (translated or original)
        const renderedContent = await marked.parse(finalContent);
        contentArea.innerHTML = renderedContent;

        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333"; // Update font color
        hideLoading(); // Ensure the loader is hidden after rendering
      });
    } catch (error) {
      console.error("Error rendering content:", error);
      contentArea.innerHTML = `<p>${escapeHTML(summary)}</p>`;
      hideLoading(); // Hide loader on error
    }
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
  // Retrieve necessary data from storage
  chrome.storage.sync.get(
    ["summarizeMode", "lastHighlightedText", "sourceLang", "targetLang"],
    async (data) => {
      const mode = data.summarizeMode || "brief";
      const sourceLang = data.sourceLang || "en"; // Fetch the current source language
      const targetLang = data.targetLang || "en"; // Fetch the current target language

      // Debugging logs
      console.log("Mode:", mode);
      console.log("Source Language:", sourceLang);
      console.log("Target Language:", targetLang);
      console.log("Retrieved lastHighlightedText:", data.lastHighlightedText);

      // Handle text summarization
      let textToSummarize = data.lastHighlightedText || "";

      if (!textToSummarize) {
        textToSummarize = getFullPageText(); // Fallback to full page text
        if (!textToSummarize) {
          showInAppNotification("No text available to regenerate the summary.");
          return;
        }
        console.log("Fetched full-page text:", textToSummarize);
      }

      textToSummarize = truncateText(textToSummarize); // Truncate text if necessary
      showLoading(); // Show loading spinner

      // Summarize the text
      chrome.runtime.sendMessage(
        {
          action: "summarize",
          mode,
          text: textToSummarize,
        },
        async (response) => {
          hideLoading(); // Hide loading spinner

          if (response?.summary) {
            // Translate the summary if source and target languages differ
            let finalSummary = response.summary;
            if (sourceLang !== targetLang) {
              try {
                const translatedText = await translateContent(
                  sourceLang,
                  targetLang,
                  finalSummary
                );
                finalSummary = translatedText || finalSummary; // Fallback to original if translation fails
              } catch (error) {
                console.error("Error translating text summary:", error);
                showInAppNotification(
                  "Translation failed. Displaying the original summary."
                );
              }
            }
            displaySummary(finalSummary, response.takeaways || [], mode); // Display final summary
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

// Listener to capture highlighted text and save it
document.addEventListener("mouseup", () => {
  const selectedText = window.getSelection()?.toString();
  if (selectedText && selectedText.trim() !== "") {
    chrome.storage.sync.set({ lastHighlightedText: selectedText }, () => {
      console.log("Saved highlighted text:", selectedText);
    });
  }
});
