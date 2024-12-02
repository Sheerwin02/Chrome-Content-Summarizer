import { summarizeText, summarizeFullPage } from "../apis/summarize";
import { handleFileUploadAndSummarize } from "../apis/fileHandler";
import { summarizeDoc } from "@/apis/summarize";
import {
  ensureContentScriptLoaded,
  handleSelectionSummarize,
  updateActiveTab,
} from "@/utils/handle";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ContentState {
  type: "text" | "document" | null;
  content: any;
  lastSummary?: {
    summary: string;
    takeaways: string[];
    mode: string;
  };
  isProcessing: boolean;
  currentRequest?: AbortController; // Add this to track current request
}

let currentState: ContentState = {
  type: null,
  content: null,
  isProcessing: false,
};

const apiKey = import.meta.env.VITE_API_KEY as string;
let genAI: GoogleGenerativeAI | null = null;

// Initialize AI model
async function initializeAIModel() {
  try {
    console.log("Initializing Google Generative AI...");
    if (!apiKey) {
      throw new Error("API key not found");
    }
    genAI = new GoogleGenerativeAI(apiKey);
    console.log("AI model initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize AI model:", error);
    return false;
  }
}

export default defineBackground(() => {
  console.log("Background script starting...", { id: chrome.runtime.id });

  // Initialize AI model on startup
  initializeAIModel().then((success) => {
    console.log("AI initialization result:", success);
  });

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

    if (!genAI) {
      console.error("AI model not initialized");
      return;
    }

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

  // Message listener with AI initialization check
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message);

    if (!genAI) {
      console.log("AI not initialized, attempting to initialize...");
      initializeAIModel().then((success) => {
        if (!success) {
          sendResponse({ error: "Failed to initialize AI model" });
        } else {
          handleMessage(message, sender, sendResponse);
        }
      });
      return true;
    }

    return handleMessage(message, sender, sendResponse);
  });

  function handleMessage(message: any, sender: any, sendResponse: any) {
    switch (message.action) {
      case "checkModelStatus":
        sendResponse({ initialized: !!genAI });
        return true;

      // In the handleMessage function, modify the summarize case:
      case "summarize": {
        console.log("Handling summarize action:", message);

        // Cancel any existing request
        if (currentState.currentRequest) {
          currentState.currentRequest.abort();
        }

        const abortController = new AbortController();
        currentState.currentRequest = abortController;

        const { text, mode } = message;
        if (!text) {
          console.error("No text provided for summarization");
          sendResponse({ error: "No text provided" });
          return true;
        }

        // Add timeout handling
        const timeout = setTimeout(() => {
          if (currentState.isProcessing) {
            abortController.abort();
            sendResponse({
              error:
                "Request timed out. Please try again with a shorter text selection.",
            });
          }
        }, 30000); // 30 second timeout

        (async () => {
          try {
            currentState.isProcessing = true;
            const result = await summarizeText(
              text,
              mode || "brief",
              abortController.signal
            );
            clearTimeout(timeout);
            currentState.isProcessing = false;
            console.log("Summarization result:", result);
            sendResponse({
              summary: result.summary,
              takeaways: result.takeaways,
            });
          } catch (error) {
            clearTimeout(timeout);
            currentState.isProcessing = false;
            console.error("Summarization error:", error);

            // Check if it was an abort
            if ((error as Error).name === "AbortError") {
              sendResponse({
                error:
                  "Operation cancelled. Please try again with a shorter selection.",
              });
              return;
            }

            sendResponse({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to summarize text",
            });
          } finally {
            currentState.currentRequest = undefined;
          }
        })();

        return true;
      }

      case "summarizeDocument": {
        if (!genAI) {
          sendResponse({ error: "AI model not initialized" });
          return true;
        }

        const { mode, fileState } = message;

        if (!fileState) {
          sendResponse({ error: "No document state provided" });
          return true;
        }

        (async () => {
          try {
            const result = await summarizeDoc(mode, genAI);
            sendResponse({
              summary: result.summary,
              takeaways: result.takeaways,
            });
          } catch (error) {
            console.error("Document summarization error:", error);
            sendResponse({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to summarize document",
            });
          }
        })();

        return true;
      }

      case "uploadDocument": {
        if (!genAI) {
          sendResponse({ success: false, error: "AI model not initialized" });
          return true;
        }

        if (!message.file || !message.file.data) {
          sendResponse({
            success: false,
            error: "No valid file data provided",
          });
          return true;
        }

        // Using an async IIFE to handle the file upload
        (async () => {
          try {
            const fileData = {
              name: message.file.name,
              type: message.file.type,
              data: message.file.data,
            };

            currentState = {
              type: "document",
              content: fileData,
              isProcessing: false,
            };

            const result = await handleFileUploadAndSummarize(
              fileData,
              apiKey,
              (progress) => {
                console.log("Upload progress:", progress);
              }
            );

            currentState.lastSummary = {
              summary: result.summary,
              takeaways: result.takeaways,
              mode: "brief",
            };

            sendResponse({
              success: true,
              summary: result.summary,
              takeaways: result.takeaways,
            });
          } catch (error) {
            console.error("Upload error:", error);
            currentState = {
              type: null,
              content: null,
              isProcessing: false,
            };
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })();

        return true;
      }
    }
  }

  // Mode change listener with AI check
  let modeChangeTimeout: NodeJS.Timeout | null = null;

  chrome.storage.onChanged.addListener((changes) => {
    if (!genAI) {
      console.error("Cannot process mode change: AI model not initialized");
      return;
    }

    if (changes.summarizeMode || changes.customPrompt) {
      if (modeChangeTimeout) {
        clearTimeout(modeChangeTimeout);
      }

      modeChangeTimeout = setTimeout(async () => {
        let port: chrome.runtime.Port | null = null;

        try {
          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const activeTab = tabs[0];
          if (!activeTab?.id) return;

          port = chrome.tabs.connect(activeTab.id, { name: "modeSwitchPort" });
          port.postMessage({ action: "showLoading" });

          const { summarizeMode } = await chrome.storage.sync.get(
            "summarizeMode"
          );
          const mode = summarizeMode || "brief";

          // Get the current file state from storage
          const { currentFileState } = await chrome.storage.local.get(
            "currentFileState"
          );

          console.log("Current file state:", currentFileState); // Debug log

          let result;
          if (currentState.type === "document" && currentFileState) {
            if (!genAI) {
              throw new Error("AI model not initialized");
            }

            port.postMessage({
              action: "processingUpdate",
              status: "Regenerating summary...",
            });

            // Pass the complete file state to summarizeDoc
            result = await summarizeDoc(mode, genAI);
          } else if (currentState.type === "text" && currentState.content) {
            result = await summarizeText(
              currentState.content,
              mode,
              new AbortController().signal
            );
          } else {
            throw new Error("No content available to regenerate");
          }

          if (result) {
            currentState.lastSummary = { ...result, mode };
            port.postMessage({
              action: "displaySummary",
              summary: result.summary,
              takeaways: result.takeaways,
              mode: mode,
              isDocument: currentState.type === "document",
            });
          }
        } catch (error) {
          console.error("Error in mode change handler:", error);
          port?.postMessage({
            action: "displayError",
            error:
              error instanceof Error
                ? error.message
                : "Failed to regenerate summary",
          });
        } finally {
          port?.postMessage({ action: "hideLoading" });
          if (port) {
            setTimeout(() => {
              if (port) {
                port.disconnect();
              }
            }, 100);
          }
        }
      }, 300);
    }
  });
});
