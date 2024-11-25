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

    // Add context menu for summarizing the full page
    chrome.contextMenus.create({
      id: "summarizeFullPage",
      title: "Summarize Full Page",
      contexts: ["page"],
    });
  });

  // Single context menu click handler
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === "summarizeSelection" && info.selectionText) {
      lastHighlightedText = info.selectionText;

      chrome.storage.sync.set({ lastHighlightedText }, () => {
        console.log("Text stored for regeneration.");
      });

      handleSummarizeRequest(tab.id, info.selectionText);
    } else if (info.menuItemId === "summarizeFullPage") {
      summarizeFullPage(tab.id);
    }
  });

  // Single message listener for all message types
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case "summarize":
        const textToSummarize = lastHighlightedText || message.text;
        if (textToSummarize) {
          handleSummarizeRequest(sender.tab?.id, textToSummarize, sendResponse);
        } else {
          sendResponse({ error: "No text to summarize" });
        }
        break;

      case "summarizeFullPage":
        if (sender.tab?.id) {
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
    }

    return true; // Keep message channel open for async response
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
        if (!textToSummarize) {
          sendResponse({ error: "No text to summarize" });
          return;
        }

        chrome.storage.sync.get(["summarizeMode"], (data) => {
          const mode = data.summarizeMode || "brief";

          summarizeText(textToSummarize, mode)
            .then(({ summary, takeaways }) => {
              sendResponse({ summary, takeaways }); // Send both fields
            })
            .catch((error) => {
              console.error("Error:", error);
              sendResponse({ error: "Failed to summarize text" });
            });
        });

        return true; // Keeps the message channel open for async response
    }

    if (message.action === "summarizeFullPage") {
      // Handle full-page summarization from popup
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id) {
          summarizeFullPage(activeTab.id)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Error summarizing full page:", error);
              sendResponse({
                success: false,
                error: "Failed to summarize full page",
              });
            });
        }
      });

      return true; // Keeps the message channel open for async response
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

  async function summarizeFullPage(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => document.body.innerText, // Extract full page content
        },
        async (results) => {
          const fullPageText = results[0]?.result;

          if (!fullPageText || fullPageText.trim() === "") {
            console.error("Failed to retrieve full page text.");
            reject("Failed to retrieve full page text.");
            return;
          }

          console.log("Full page text extracted:", fullPageText);

          lastHighlightedText = fullPageText;

          chrome.storage.sync.get(["summarizeMode"], async (data) => {
            const mode = data.summarizeMode || "brief";

            try {
              const { summary, takeaways } = await summarizeText(
                fullPageText,
                mode
              );
              chrome.tabs.sendMessage(tabId, {
                action: "displaySummary",
                summary: summary, // Send only the summary
                takeaways: takeaways, // Send both summary and key takeaways
                mode,
              });
              console.log("Sending to content script:", {
                summary,
                takeaways,
                mode,
              });
              resolve();
            } catch (error) {
              console.error("Error summarizing full page:", error);
              reject(error);
            }
          });
        }
      );
    });
  }

  async function summarizeText(
    selectedText: string,
    mode: string
  ): Promise<{ summary: string; takeaways: string[] }> {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let promptText = "";
    switch (mode) {
      case "detailed":
        promptText = `Provide a detailed summary of the following content. 
          After completing the summary, clearly separate the "Key Takeaways" section with this title and provide 3-5 actionable insights:
          "${selectedText}"`;
        break;

      case "bullet_points":
        promptText = `
          Create a professional, well-organized summary of the following content in markdown bullet-point format:
          - Use bold headers (e.g., **Section Title**) to organize the summary.
          - Separate a section titled "Key Takeaways" at the end with actionable insights:
            - Example: **Key Takeaway 1**: [Actionable insight].
          Content:
          "${selectedText}"
        `;
        break;

      default:
        promptText = `Summarize the following content briefly and concisely. Clearly separate the "Key Takeaways" section with this title and provide actionable insights:
          "${selectedText}"`;
    }

    const requestBody = {
      contents: [{ parts: [{ text: promptText }] }],
    };

    console.log("Requesting summary with payload:", requestBody);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;
        try {
          // Attempt to parse the response body for additional error details
          const errorDetails = await response.json();
          errorMessage += `: ${
            errorDetails.error?.message || JSON.stringify(errorDetails)
          }`;
        } catch (parseError) {
          errorMessage += " (Unable to parse error details)";
        }
        throw new Error(errorMessage);
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
        const rawOutput = data.candidates[0].content.parts[0].text;

        // Use regex to split the summary and key takeaways
        const summaryMatch = rawOutput.split(/\*\*Key Takeaways\*\*/i); // Split at "Key Takeaways" header
        const summary = summaryMatch[0]?.trim(); // Everything before "Key Takeaways"
        const takeaways: string[] = [];

        if (summaryMatch.length > 1) {
          // Process the "Key Takeaways" section
          const takeawaysSection = summaryMatch[1];
          const takeawayLines = takeawaysSection
            .split("\n")
            .filter((line: String) => line.trim().startsWith("*"));

          for (const line of takeawayLines) {
            takeaways.push(line.replace(/^\*+/, "").trim()); // Clean up markdown bullet points
          }
        }

        console.log("Parsed Summary:", summary);
        console.log("Parsed Takeaways:", takeaways);

        return { summary, takeaways };
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
