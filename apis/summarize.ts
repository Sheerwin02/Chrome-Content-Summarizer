const apiKey = import.meta.env.VITE_API_KEY as string;
let lastHighlightedText: string | null = null;

export async function summarizeFullPage(tabId: number): Promise<void> {
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
  
export async function summarizeText(selectedText: string, mode: string): Promise<{ summary: string; takeaways: string[] }> {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
    let promptText = "";
    if (mode === "customize") {
      const storageData = await new Promise<{ customPrompt?: string }>((resolve) => {
        chrome.storage.sync.get(["customPrompt"], (items) => resolve(items as { customPrompt?: string }));
      });
    
      promptText = storageData.customPrompt?.trim()
        ? `${storageData.customPrompt.trim()} Clearly separate a Key Takeaways section with this title: "${selectedText}"`
        : `Summarize the following content briefly and concisely. Clearly separate the "Key Takeaways" section with this title and provide actionable insights: "${selectedText}"`;
    
      console.log("Using custom prompt:", promptText);
        
    } else {
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
          errorMessage += `: ${errorDetails.error?.message || JSON.stringify(errorDetails)}`;
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
          const takeawayLines = takeawaysSection.split("\n").filter((line: String) => line.trim().startsWith("*"));
  
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