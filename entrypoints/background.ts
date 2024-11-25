import { summarizeText } from "../apis/summarize";
let lastHighlightedText: string | null = null;

export default defineBackground(() => {
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

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id) {
      if (info.menuItemId === "summarizeSelection" && info.selectionText) {
        lastHighlightedText = info.selectionText;
  
        chrome.storage.sync.set({ lastHighlightedText}, () => {
          console.log("Text stored for regeneration.");
        });
  
        chrome.storage.sync.get(["summarizeMode"], (data) => {
          const mode = data.summarizeMode || "brief";
          const textToSummarize = lastHighlightedText || "";
  
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id as number },
              files: ["content-scripts/content.js"],
            },
            () => {
              summarizeText(textToSummarize, mode)
                .then(({ summary, takeaways }) => {
                  // Send both summary and takeaways to the content script
                  chrome.tabs.sendMessage(tab.id!, { 
                    action: "displaySummary", 
                    summary, 
                    takeaways, 
                    mode 
                  });
                })
                .catch((error) => {
                  console.error("Error summarizing text:", error);
                });
            }
          );
        });
      } else if (info.menuItemId === "summarizeFullPage") {
        // Call full-page summarization logic
        summarizeFullPage(tab.id!);
      }
    }
  });  

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "summarize") {
      const textToSummarize = lastHighlightedText || message.text;

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
          summarizeFullPage(activeTab.id).then(() => {
            sendResponse({ success: true });
          }).catch((error) => {
            console.error("Error summarizing full page:", error);
            sendResponse({ success: false, error: "Failed to summarize full page" });
          });
        }
      });

      return true; // Keeps the message channel open for async response
    }
  });

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
              const { summary, takeaways } = await summarizeText(fullPageText, mode);
              chrome.tabs.sendMessage(tabId, {
                action: "displaySummary",
                summary: summary, // Send only the summary
                takeaways: takeaways, // Send both summary and key takeaways
                mode,
              });
              console.log("Sending to content script:", { summary, takeaways, mode });
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
});
