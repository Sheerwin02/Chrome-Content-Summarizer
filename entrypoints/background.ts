const apiKey = import.meta.env.VITE_API_KEY as string;
let lastHighlightedText: string | null = null;

export default defineBackground(() => {
  console.log("Hello background!", { id: chrome.runtime.id });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "summarizeSelection",
      title: "Summarize Selection",
      contexts: ["selection"],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "summarizeSelection" && info.selectionText && tab?.id) {
      lastHighlightedText = info.selectionText;

      chrome.storage.sync.get(["summarizeMode"], (data) => {
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
                chrome.tabs.sendMessage(tab.id!, { action: "displaySummary", summary, mode });
              })
              .catch((error) => {
                console.error("Error summarizing text:", error);
              });
          }
        );
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "summarize") {
      const textToSummarize = lastHighlightedText || message.text;

      chrome.storage.sync.get(["summarizeMode"], (data) => {
        const mode = data.summarizeMode || "brief";
        summarizeText(textToSummarize, mode)
          .then((summary) => {
            sendResponse({ summary });
          })
          .catch((error) => {
            console.error("Error:", error);
            sendResponse({ error: "Failed to summarize text" });
          });
      });

      return true; // Keeps the message channel open for async response
    }

    if (message.action === "summarizeFullPage") {
      // Handle full-page summarization
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id) {
          chrome.scripting.executeScript(
            {
              target: { tabId: activeTab.id },
              func: () => document.body.innerText, // Retrieves the entire page text content
            },
            (results) => {
              const fullPageText = results[0].result;
              chrome.storage.sync.get(["summarizeMode"], (data) => {
                const mode = data.summarizeMode || "brief";
                // TODO: Make sure there's a string passed in before calling summarizeText
                summarizeText(fullPageText || "", mode)
                  .then((summary) => {
                    chrome.tabs.sendMessage(activeTab.id!, { action: "displaySummary", summary, mode });
                    sendResponse({ success: true });
                  })
                  .catch((error) => {
                    console.error("Error summarizing full page:", error);
                    sendResponse({ success: false, error: "Failed to summarize full page" });
                  });
              });
            }
          );
        }
      });
      return true; // Keeps the message channel open for async response
    }
  });

  async function summarizeText(selectedText: string, mode: string): Promise<string> {
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
});
