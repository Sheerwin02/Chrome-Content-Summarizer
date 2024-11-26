import { summarizeText } from "../apis/summarize";
import { handleFileUploadAndSummarize } from "../apis/fileHandler";

interface ContentState {
  type: "text" | "document" | null;
  content: any;
  lastSummary?: {
    summary: string;
    takeaways: string[];
    mode: string;
  };
  isProcessing: boolean;
}

let currentState: ContentState = {
  type: null,
  content: null,
  isProcessing: false,
};

const apiKey = import.meta.env.VITE_API_KEY as string;

export default defineBackground(() => {
  console.log("Hello background!", { id: chrome.runtime.id });

  // Context menu setup
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "summarizeSelection",
      title: "Summarize Selection",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: "summarizeFullPage",
      title: "Summarize Full Page",
      contexts: ["page"],
    });
  });

  // Context menu handler
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    clearPreviousContent();

    if (info.menuItemId === "summarizeSelection" && info.selectionText) {
      currentState = {
        type: "text",
        content: info.selectionText,
        isProcessing: false,
      };
      handleSelectionSummarize(tab.id, info.selectionText);
    } else if (info.menuItemId === "summarizeFullPage") {
      currentState.type = "text";
      summarizeFullPage(tab.id);
    }
  });

  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message);

    switch (message.action) {
      case "uploadDocument":
        if (message.file && !currentState.isProcessing) {
          clearPreviousContent();

          currentState = {
            type: "document",
            content: message.file,
            isProcessing: true,
          };

          handleFileUploadAndSummarize(message.file, apiKey)
            .then(({ summary, takeaways }) => {
              const mode = "brief";
              currentState.lastSummary = { summary, takeaways, mode };
              currentState.isProcessing = false;
              console.log("Document processed successfully");
              sendResponse({
                success: true,
                summary,
                takeaways,
                isDocument: true,
              });
            })
            .catch((error) => {
              currentState.isProcessing = false;
              console.error("Error processing document:", error);
              sendResponse({
                success: false,
                error: error.message,
              });
            });
        }
        break;

      case "summarize":
        if (!currentState.isProcessing) {
          clearPreviousContent();

          const textToSummarize = message.text;
          if (textToSummarize) {
            currentState = {
              type: "text",
              content: textToSummarize,
              isProcessing: true,
            };

            chrome.storage.sync.get(["summarizeMode"], async (data) => {
              try {
                const mode = data.summarizeMode || "brief";
                const { summary, takeaways } = await summarizeText(
                  textToSummarize,
                  mode
                );
                currentState.lastSummary = { summary, takeaways, mode };
                currentState.isProcessing = false;
                sendResponse({ summary, takeaways, isDocument: false });
              } catch (error) {
                currentState.isProcessing = false;
                console.error("Error:", error);
                sendResponse({ error: "Failed to summarize text" });
              }
            });
          } else {
            sendResponse({ error: "No text to summarize" });
          }
        }
        break;

      case "summarizeFullPage":
        if (sender.tab?.id) {
          clearPreviousContent();
          currentState.type = "text";
          summarizeFullPage(sender.tab.id)
            .then(() => sendResponse({ success: true }))
            .catch((error) => {
              console.error("Error summarizing full page:", error);
              sendResponse({
                success: false,
                error: "Failed to summarize full page",
              });
            });
        }
        break;

      case "clearContent":
        clearPreviousContent();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: "Unknown action" });
        break;
    }

    return true; // Keep the message channel open for async responses
  });

  function clearPreviousContent() {
    currentState = {
      type: null,
      content: null,
      isProcessing: false,
    };

    chrome.storage.local.remove("currentFileState");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { action: "clearSummary" });
      }
    });
  }

  // Mode change listener with debouncing
  let modeChangeTimeout: NodeJS.Timeout | null = null;
  chrome.storage.onChanged.addListener((changes) => {
    if (
      (changes.summarizeMode || changes.customPrompt) &&
      currentState.type &&
      !currentState.isProcessing
    ) {
      // Clear any pending timeout
      if (modeChangeTimeout) {
        clearTimeout(modeChangeTimeout);
      }

      // Set a new timeout to debounce multiple rapid changes
      modeChangeTimeout = setTimeout(() => {
        chrome.storage.sync.get(
          ["summarizeMode", "customPrompt"],
          async (data) => {
            const mode = data.summarizeMode || "brief";

            try {
              currentState.isProcessing = true;

              if (currentState.type === "document" && currentState.content) {
                console.log("Regenerating document summary");
                const { summary, takeaways } =
                  await handleFileUploadAndSummarize(
                    currentState.content,
                    apiKey
                  );
                currentState.lastSummary = { summary, takeaways, mode };
                updateActiveTab(summary, takeaways, mode, true);
              } else if (currentState.type === "text" && currentState.content) {
                console.log("Regenerating text summary");
                const { summary, takeaways } = await summarizeText(
                  currentState.content,
                  mode
                );
                currentState.lastSummary = { summary, takeaways, mode };
                updateActiveTab(summary, takeaways, mode, false);
              }

              currentState.isProcessing = false;
            } catch (error) {
              currentState.isProcessing = false;
              console.error("Error regenerating content:", error);
            }
          }
        );
      }, 300); // 300ms debounce delay
    }
  });

  // Reset state when tab changes or closes
  chrome.tabs.onActivated.addListener(clearPreviousContent);
  chrome.tabs.onRemoved.addListener(clearPreviousContent);

  async function ensureContentScriptLoaded(tabId: number): Promise<void> {
    try {
      // Check if content script is already loaded
      await chrome.tabs.sendMessage(tabId, { action: "ping" });
    } catch (error) {
      // If not loaded, inject the content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content-scripts/content.js"],
      });

      // Wait a bit for the script to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function updateActiveTab(
    summary: string,
    takeaways: string[],
    mode: string,
    isDocument: boolean
  ) {
    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab?.id) {
        await ensureContentScriptLoaded(activeTab.id);

        await chrome.tabs.sendMessage(activeTab.id, {
          action: "displaySummary",
          summary,
          takeaways,
          mode,
          isDocument,
        });
      }
    } catch (error) {
      console.error("Error updating active tab:", error);
    }
  }

  // Mode change listener with debouncing
  chrome.storage.onChanged.addListener((changes) => {
    if (
      (changes.summarizeMode || changes.customPrompt) &&
      currentState.type &&
      !currentState.isProcessing
    ) {
      if (modeChangeTimeout) {
        clearTimeout(modeChangeTimeout);
      }

      modeChangeTimeout = setTimeout(async () => {
        try {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });

          if (!activeTab?.id) return;

          // Ensure content script is loaded before proceeding
          await ensureContentScriptLoaded(activeTab.id);

          const { summarizeMode, customPrompt } = await chrome.storage.sync.get(
            ["summarizeMode", "customPrompt"]
          );

          const mode = summarizeMode || "brief";

          currentState.isProcessing = true;

          if (currentState.type === "document" && currentState.content) {
            console.log("Regenerating document summary");
            const { summary, takeaways } = await handleFileUploadAndSummarize(
              currentState.content,
              apiKey
            );
            currentState.lastSummary = { summary, takeaways, mode };
            await updateActiveTab(summary, takeaways, mode, true);
          } else if (currentState.type === "text" && currentState.content) {
            console.log("Regenerating text summary");
            const { summary, takeaways } = await summarizeText(
              currentState.content,
              mode
            );
            currentState.lastSummary = { summary, takeaways, mode };
            await updateActiveTab(summary, takeaways, mode, false);
          }
        } catch (error) {
          console.error("Error in mode change handler:", error);
        } finally {
          currentState.isProcessing = false;
        }
      }, 300);
    }
  });

  async function handleSelectionSummarize(tabId: number, text: string) {
    try {
      await ensureContentScriptLoaded(tabId);

      const { summarizeMode } = await chrome.storage.sync.get("summarizeMode");
      const mode = summarizeMode || "brief";
      const { summary, takeaways } = await summarizeText(text, mode);

      currentState.lastSummary = { summary, takeaways, mode };
      await updateActiveTab(summary, takeaways, mode, false);
    } catch (error) {
      console.error("Error in handleSelectionSummarize:", error);
    }
  }

  async function summarizeFullPage(tabId: number): Promise<void> {
    try {
      await ensureContentScriptLoaded(tabId);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.body.innerText,
      });

      const fullPageText = results[0]?.result;
      if (!fullPageText?.trim()) {
        throw new Error("Failed to retrieve full page text.");
      }

      currentState.content = fullPageText;
      const { summarizeMode, customPrompt } = await chrome.storage.sync.get([
        "summarizeMode",
        "customPrompt",
      ]);

      const mode = summarizeMode || "brief";
      const { summary, takeaways } = await summarizeText(fullPageText, mode);

      currentState.lastSummary = { summary, takeaways, mode };
      await updateActiveTab(summary, takeaways, mode, false);
    } catch (error) {
      console.error("Error in summarizeFullPage:", error);
      throw error;
    }
  }
});
