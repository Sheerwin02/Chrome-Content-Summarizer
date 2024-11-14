export default defineBackground(() => {
  console.log("Hello background!", { id: chrome.runtime.id });

  // Add context menu for summarizing selected text
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "summarizeSelection",
      title: "Summarize Selection",
      contexts: ["selection"], // Only show when text is selected
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "summarizeSelection" && info.selectionText && tab?.id) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: ["content-scripts/content.js"]
        },
        () => {
          // After injecting, send the message
          summarizeText(info.selectionText!)
            .then((summary: string) => {
              chrome.tabs.sendMessage(tab.id!, { action: "displaySummary", summary });
            })
            .catch((error: Error) => {
              console.error("Error summarizing text:", error);
            });
        }
      );
    }
  });
  
  async function summarizeText(selectedText: string): Promise<string> {
    const apiKey = 'API_KEY'; // Replace with your actual API key
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
    const requestBody = {
      contents: [
        {
          parts: [{ text: selectedText }]
        }
      ]
    };
  
    console.log("Requesting summary with payload:", requestBody);
  
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
  
      const data = await response.json();
      console.log("API Response:", JSON.stringify(data, null, 2));
  
      // Access the summary text based on the response structure
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
