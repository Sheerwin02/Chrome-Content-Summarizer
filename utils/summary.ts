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
import { getCurrentFileState } from "@/apis/fileHandler";
import { translateTakeaways } from "@/apis/translation";

let isDarkMode = true; // Default to dark mode

export async function displaySummary(
  summary: string,
  takeaways: string[],
  mode: string
) {
  // Get or create sidebar
  let sidebar = document.getElementById("summarySidebar");
  if (!sidebar) {
    sidebar = createSidebar();
    document.body.appendChild(sidebar);
  }

  // Get content area
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

    // Handle empty summary
    if (summary.trim() === "") {
      contentArea.innerHTML = `
        <div class="placeholder">
          <p>No summary available yet. Highlight some text and summarize!</p>
        </div>`;
      console.log("Placeholder added to content area.");
      hideLoading();
      return;
    }

    try {
      // Get translation settings
      const { sourceLang = "en", targetLang = "en" } = await new Promise<{
        sourceLang?: string;
        targetLang?: string;
      }>((resolve) => {
        chrome.storage.sync.get(
          ["sourceLang", "targetLang"] as Array<
            keyof typeof chrome.storage.sync.get
          >,
          resolve
        );
      });

      let finalContent = summary;
      let translatedTakeaways = takeaways;

      // Perform translation if languages differ
      if (sourceLang !== targetLang) {
        console.log("Translation needed:", { sourceLang, targetLang });
        showLoading(); // Keep the loader running during translation

        try {
          // Translate summary
          const translatedText = await translateContent(
            sourceLang,
            targetLang,
            summary
          );
          if (translatedText) {
            finalContent = translatedText;
            console.log("Summary translation successful");
          } else {
            console.warn("Summary translation failed, using original");
          }

          // Translate takeaways
          if (takeaways.length > 0) {
            translatedTakeaways = await translateTakeaways(
              takeaways,
              sourceLang,
              targetLang
            );
            console.log("Takeaways translation completed");
          }
        } catch (translationError) {
          console.error("Error during translation:", translationError);
          showInAppNotification(
            "Translation failed. Displaying the original content."
          );
        }
      }

      // Render content (translated or original)
      try {
        const renderedContent = await marked.parse(finalContent);
        contentArea.innerHTML = renderedContent;
        contentArea.style.color = isDarkMode ? "#F0F0F0" : "#333";
      } catch (renderError) {
        console.error("Error rendering markdown:", renderError);
        contentArea.innerHTML = `<p>${escapeHTML(finalContent)}</p>`;
      }

      // Store takeaways for later use
      chrome.storage.sync.set(
        {
          lastTakeaways: translatedTakeaways,
          originalTakeaways: takeaways, // Store originals for potential re-translation
        },
        () => {
          console.log("Takeaways stored:", {
            translated: translatedTakeaways.length,
            original: takeaways.length,
          });
        }
      );
    } catch (error) {
      console.error("Error processing content:", error);
      // Fallback to displaying original content
      contentArea.innerHTML = `<p>${escapeHTML(summary)}</p>`;

      // Store original takeaways on error
      chrome.storage.sync.set({
        lastTakeaways: takeaways,
        originalTakeaways: takeaways,
      });
    }
  } catch (error) {
    console.error("Error in displaySummary function:", error);
  } finally {
    // Always ensure the loader is hidden
    hideLoading();
  }
}

export async function regenerateSummary() {
  try {
    showLoading();

    // Get current mode and translation settings
    const {
      summarizeMode: mode = "brief",
      sourceLang = "en",
      targetLang = "en",
    } = await new Promise<{
      summarizeMode?: string;
      sourceLang?: string;
      targetLang?: string;
    }>((resolve) => {
      chrome.storage.sync.get(
        [
          "summarizeMode",
          "sourceLang",
          "targetLang",
        ] as unknown as (keyof typeof chrome.storage.sync.get)[],
        resolve
      );
    });

    console.log("Mode:", mode);
    console.log("Source Language:", sourceLang);
    console.log("Target Language:", targetLang);

    // Check for file state first
    const fileState = await getCurrentFileState();

    if (fileState) {
      console.log("Regenerating summary for file:", fileState.fileName);

      chrome.runtime.sendMessage(
        {
          action: "summarizeDocument",
          mode,
          fileState,
        },
        async (response) => {
          hideLoading();

          if (response?.summary) {
            let finalSummary = response.summary;

            // Handle translation if needed
            if (sourceLang !== targetLang) {
              try {
                const translatedText = await translateContent(
                  sourceLang,
                  targetLang,
                  finalSummary
                );
                finalSummary = translatedText || finalSummary;
              } catch (error) {
                console.error("Error translating file summary:", error);
                showInAppNotification(
                  "Translation failed. Displaying the original summary."
                );
              }
            }

            displaySummary(finalSummary, response.takeaways || [], mode);
          } else if (response?.error) {
            console.error("Document summarization failed:", response.error);
            showInAppNotification("Failed to regenerate summary");
          }
        }
      );
    } else {
      // Fall back to text summarization
      const { lastHighlightedText } = await new Promise<{
        lastHighlightedText?: string;
      }>((resolve) => {
        chrome.storage.sync.get({ lastHighlightedText: "" }, resolve);
      });

      console.log("Retrieved lastHighlightedText:", lastHighlightedText);

      let textToSummarize = lastHighlightedText || getFullPageText();

      if (!textToSummarize) {
        hideLoading();
        showInAppNotification("No text available to regenerate the summary.");
        return;
      }

      textToSummarize = truncateText(textToSummarize);

      chrome.runtime.sendMessage(
        {
          action: "summarize",
          mode,
          text: textToSummarize,
        },
        async (response) => {
          hideLoading();

          if (response?.summary) {
            let finalSummary = response.summary;
            if (sourceLang !== targetLang) {
              try {
                const translatedText = await translateContent(
                  sourceLang,
                  targetLang,
                  finalSummary
                );
                finalSummary = translatedText || finalSummary;
              } catch (error) {
                console.error("Error translating text summary:", error);
                showInAppNotification(
                  "Translation failed. Displaying the original summary."
                );
              }
            }
            displaySummary(finalSummary, response.takeaways || [], mode);
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
  } catch (error) {
    console.error("Error in regenerateSummary:", error);
    hideLoading();
    showInAppNotification("Failed to regenerate summary");
  }
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
