const apiKey = import.meta.env.VITE_API_KEY_CCT as string;
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
  
  async function summarizeText(selectedText: string, mode: string): Promise<{ summary: string; takeaways: string[] }> {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
    let promptText = "";
    switch (mode) {
      case "detailed":
        promptText = `Provide a detailed summary of the following content with all necessary context. After the summary, generate 3-5 key takeaways (actionable insights) based on the content:
          "${selectedText}"`;
        break;
  
        case "bullet_points":
          promptText = `
            Create a professional and well-organized summary of the following content in markdown bullet-point format.
            Use the following guidelines:
            - Each key section must be prefixed with a bold header in markdown (e.g., **Company Overview**).
            - Use a new line between each header and its bullet points.
            - Each bullet point must start with a dash (-) and appear on its own line.
            - Do not add extra asterisks or other unnecessary symbols in the output.
            Content:
            "${selectedText}"
            After the summary, generate 3-5 key takeaways (actionable insights) using the same markdown structure:
            - **Key Takeaway 1**: [Actionable insight]
            - **Key Takeaway 2**: [Actionable insight]
          `;
        break;
  
      default:
        promptText = `Summarize the following content in a brief and concise manner. After the summary, generate 3-5 key takeaways (actionable insights) based on the content:
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
        const rawOutput = data.candidates[0].content.parts[0].text;
      
        // Split the raw output into lines
        const lines = rawOutput.split("\n").filter((line: string) => line.trim() !== "");
      
        // Extract summary and key takeaways
        let summary = lines.join("\n"); // Re-add newlines between parsed lines
        const takeaways: string[] = [];

        let isTakeawaySection = false;
      
        for (const line of lines) {
          if (line.toLowerCase().includes("key takeaways")) {
            isTakeawaySection = true;
            continue; // Skip the header line
          }
      
          if (isTakeawaySection) {
            takeaways.push(line.replace(/^- /, "").trim());
          } else {
            summary += `${line} `;
          }
        }
      
        console.log("Parsed Summary:", summary.trim());
        console.log("Parsed Takeaways:", takeaways);
      
        return { summary: summary.trim(), takeaways };
      
      } else {
        throw new Error("No valid summary content found in API response");
      }
    } catch (error) {
      console.error("Error summarizing text:", error);
      throw error;
    }
  }  
});
