import { GoogleGenerativeAI } from "@google/generative-ai";
import { handleFileUploadAndSummarize } from "../apis/fileHandler";

const apiKey = import.meta.env.VITE_API_KEY as string;

let lastHighlightedText: string | null = null;

export default defineBackground(() => {
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_API_KEY);
  console.log("Hello background!", { id: chrome.runtime.id });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "summarizeSelection",
      title: "Summarize Selection",
      contexts: ["selection"],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (
      info.menuItemId === "summarizeSelection" &&
      info.selectionText &&
      tab?.id
    ) {
      lastHighlightedText = info.selectionText;

      chrome.storage.sync.get(["summarizeMode"], async (data) => {
        const mode = data.summarizeMode || "brief";
        const textToSummarize = lastHighlightedText || "";

        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id! },
            files: ["content-scripts/content.js"],
          },
          () => {
            summarizeText(textToSummarize, mode)
              .then((summary) => {
                chrome.tabs.sendMessage(tab.id!, {
                  action: "displaySummary",
                  summary,
                  mode,
                });
              })
              .catch((error: unknown) => {
                console.error("Error summarizing text:", error);
              });
          }
        );
      });
    }
  });

  // Single message listener for all message types
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Track whether we've handled the response
    let responseHandled = false;

    switch (message.action) {
      case "uploadDocument":
        if (message.file) {
          console.log("File received in background:", message.file.name);
          handleFileUploadAndSummarize(message.file, apiKey)
            .then((summary) => {
              if (!responseHandled) {
                sendResponse({ success: true, summary });
                responseHandled = true;
              }
            })
            .catch((error) => {
              if (!responseHandled) {
                console.error("Error processing file:", error);
                sendResponse({ success: false, error: error.message });
                responseHandled = true;
              }
            });
        }
        break;

      case "summarize":
        const textToSummarize = lastHighlightedText || message.text;
        if (textToSummarize) {
          handleSummarizeRequest(sender.tab?.id, textToSummarize, sendResponse);
        }
        break;

      case "summarizeFullPage":
        handleFullPageSummarization(sender, sendResponse);
        break;
    }

    // Return true to indicate we'll send a response asynchronously
    return true;
  });

  async function handleSummarizeRequest(
    tabId: number | undefined,
    text: string,
    sendResponse?: (response: any) => void
  ) {
    try {
      const { summarizeMode } = await chrome.storage.sync.get("summarizeMode");
      const mode = summarizeMode || "brief";
      const summary = await summarizeText(text, mode);

      if (tabId) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content-scripts/content.js"],
        });

        chrome.tabs.sendMessage(tabId, {
          action: "displaySummary",
          summary,
          mode,
        });
      }

      if (sendResponse) {
        sendResponse({ summary });
      }
    } catch (error) {
      console.error("Error in handleSummarizeRequest:", error);
      if (sendResponse) {
        sendResponse({ error: "Failed to summarize text" });
      }
    }
  }

  async function handleFullPageSummarization(
    sender: any,
    sendResponse: (response: any) => void
  ) {
    try {
      const activeTab = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (activeTab[0]?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab[0].id },
          func: () => document.body.innerText,
        });

        const fullPageText = results[0].result;
        const { summarizeMode } = await chrome.storage.sync.get([
          "summarizeMode",
        ]);
        const mode = summarizeMode || "brief";

        if (fullPageText) {
          const summary = await summarizeText(fullPageText, mode);
          chrome.tabs.sendMessage(activeTab[0].id, {
            action: "displaySummary",
            summary,
            mode,
          });
          sendResponse({ success: true });
        }
      }
    } catch (error) {
      console.error("Error summarizing full page:", error);
      sendResponse({
        success: false,
        error: "Failed to summarize full page",
      });
    }
  }

  async function summarizeText(
    selectedText: string,
    mode: string
  ): Promise<string> {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let promptText = "";
    switch (mode) {
      case "detailed":
        promptText = `Provide a detailed summary of the following content with all necessary context:
        "${selectedText}"`;
        break;

      case "bullet_points":
        promptText = `Create a professional and well-organized summary of the following content in bullet-point format. Use the following formatting guidelines:
          
          - **Use bold headers** (without bullet points) for each main topic or section (e.g., Company Overview, Key Focus Areas).
          - For each header, provide clear and concise bullet points under it without repeating the headers.
          - Ensure that each bullet point is relevant and focuses on the most important details.
        
          Content to summarize:
          "${selectedText}"`;
        break;

      default:
        promptText = `Summarize the following content in a brief and concise manner:
        "${selectedText}"`;
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: promptText,
            },
          ],
        },
      ],
    };

    console.log("Requesting summary with payload:", requestBody);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log("API Response:", JSON.stringify(data, null, 2));

      if (
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0].text
      ) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error("No valid summary content found in API response");
      }
    } catch (error) {
      console.error("Error summarizing text:", error);
      throw error;
    }
  }

  return {
    summarizeText,
  };
});
