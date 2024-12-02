import { summarizeText } from "@/apis/summarize";

let currentState: {
  lastSummary?: { summary: string; takeaways: string[]; mode: string };
  type?: string | null;
  content?: string | null;
  isProcessing?: boolean;
} = {};

export async function handleSelectionSummarize(tabId: number, text: string) {
  try {
    await ensureContentScriptLoaded(tabId);

    const { summarizeMode } = await chrome.storage.sync.get("summarizeMode");
    const mode = summarizeMode || "brief";
    const abortController = new AbortController();
    const { summary, takeaways } = await summarizeText(
      text,
      mode,
      abortController.signal
    );

    currentState.lastSummary = { summary, takeaways, mode };
    await updateActiveTab(summary, takeaways, mode, false);
  } catch (error) {
    console.error("Error in handleSelectionSummarize:", error);
  }
}

export function clearPreviousContent() {
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

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
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

export async function updateActiveTab(
  summary: string,
  takeaways: string[],
  mode: string,
  isDocument: boolean
): Promise<void> {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab?.id) {
      throw new Error("No active tab found");
    }

    await ensureContentScriptLoaded(activeTab.id);

    // Use the new sendMessageToTab utility
    await sendMessageToTab(activeTab.id, {
      action: "displaySummary",
      summary,
      takeaways,
      mode,
      isDocument,
    });
  } catch (error) {
    console.error("Error updating active tab:", error);
    throw error;
  }
}

export async function sendMessageToTab(
  tabId: number,
  message: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}
