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

      case "summarize": {
        console.log("Handling summarize action:", message);

        const { text, mode } = message;
        if (!text) {
          console.error("No text provided for summarization");
          sendResponse({ error: "No text provided" });
          return true;
        }

        // Using the summarizeText function from summarize.ts
        (async () => {
          try {
            const result = await summarizeText(text, mode || "brief");
            console.log("Summarization result:", result);
            sendResponse({
              summary: result.summary,
              takeaways: result.takeaways,
            });
          } catch (error) {
            console.error("Summarization error:", error);
            sendResponse({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to summarize text",
            });
          }
        })();

        return true; // Keep the message channel open for async response
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

      modeChangeTimeout = setTimeout(() => {
        let port: chrome.runtime.Port | null = null;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (!activeTab?.id) return;

          port = chrome.tabs.connect(activeTab.id, { name: "modeSwitchPort" });
          port.postMessage({ action: "showLoading" });

          (async () => {
            try {
              const { summarizeMode } = await chrome.storage.sync.get(
                "summarizeMode"
              );
              const mode = summarizeMode || "brief";

              let result;
              if (currentState.type === "document" && currentState.content) {
                if (!genAI) {
                  throw new Error("AI model not initialized");
                }

                const fileState = await chrome.storage.local.get(
                  "currentFileState"
                );
                if (!fileState.currentFileState) {
                  throw new Error("No file state available");
                }

                port.postMessage({
                  action: "processingUpdate",
                  status: "Regenerating summary...",
                });

                result = await summarizeDoc(mode, genAI);
              } else if (currentState.type === "text" && currentState.content) {
                result = await summarizeText(currentState.content, mode);
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
              setTimeout(() => {
                if (port) {
                  port.disconnect();
                }
              }, 100);
            }
          })();
        });
      }, 300);
    }
  });
});
