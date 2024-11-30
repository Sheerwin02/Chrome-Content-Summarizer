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

export async function summarizeText(
  selectedText: string,
  mode: string
): Promise<{ summary: string; takeaways: string[] }> {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  let promptText = "";
  if (mode === "customize") {
    const storageData = await new Promise<{ customPrompt?: string }>(
      (resolve) => {
        chrome.storage.sync.get(["customPrompt"], (items) =>
          resolve(items as { customPrompt?: string })
        );
      }
    );

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

export async function handleFullPageSummarization(
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

export async function handleSummarizeRequest(
  tabId: number | undefined,
  textToSummarize: string,
  sendResponse: (response?: any) => void
) {
  if (!tabId) {
    sendResponse({ error: "No tab ID provided" });
    return;
  }

  chrome.storage.sync.get(["summarizeMode"], (data) => {
    const mode = data.summarizeMode || "brief";

    summarizeText(textToSummarize, mode)
      .then(({ summary, takeaways }) => {
        sendResponse({ summary, takeaways });
      })
      .catch((error) => {
        console.error("Error summarizing text:", error);
        sendResponse({ error: "Failed to summarize text" });
      });
  });

  return true; // Keeps the message channel open for async response
}

export async function summarizeDoc(
  mode: string,
  genAI: any
): Promise<{ summary: string; takeaways: string[] }> {
  const fileState = await chrome.storage.local.get("currentFileState");
  const currentFileState = fileState.currentFileState;

  if (!currentFileState || currentFileState.isProcessing) {
    throw new Error("No file content available or processing in progress");
  }

  // Set processing flag
  currentFileState.isProcessing = true;
  await chrome.storage.local.set({ currentFileState });

  try {
    let promptText = "";
    if (mode === "customize") {
      const { customPrompt } = await chrome.storage.sync.get("customPrompt");
      console.log("Retrieved custom prompt:", customPrompt);

      // Ensure the custom prompt will generate separable content
      let basePrompt = customPrompt?.trim() || "";

      // Check if the custom prompt already mentions summary and takeaways
      const hasSummaryMention = /summary|overview|main\s+points/i.test(
        basePrompt
      );
      const hasTakeawaysMention =
        /takeaways|key\s+points|main\s+takeaways/i.test(basePrompt);

      console.log("Custom prompt analysis:", {
        hasSummaryMention,
        hasTakeawaysMention,
        basePrompt,
      });

      // Append necessary structure if not present
      if (!hasSummaryMention || !hasTakeawaysMention) {
        promptText = `${basePrompt}\n\nPlease structure your response with:\n1. A clear summary at the beginning\n2. A "Key Takeaways" section using bullet points for important insights\n\nEnsure these sections are clearly separated.`;
      } else {
        promptText = basePrompt;
      }

      console.log("Final custom prompt:", promptText);
    } else {
      switch (mode) {
        case "detailed":
          promptText = `Provide a detailed analysis of the document with:
            1. A comprehensive summary section focusing on the main content
            2. A separate key takeaways section with actionable bullet points`;
          break;
        case "bullet_points":
          promptText = `Analyze the document and provide:
            1. A summary section in clear bullet points
            2. A separate key takeaways section with actionable insights`;
          break;
        default: // brief mode
          promptText = `Provide a concise analysis with:
            1. A brief summary section of the main points
            2. A separate key takeaways section with essential bullet points`;
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Handle base64 content
    if (!currentFileState.content.match(/^[A-Za-z0-9+/=]+$/)) {
      const base64Match = currentFileState.content.match(
        /^data:.*;base64,(.*)$/
      );
      if (base64Match) {
        currentFileState.content = base64Match[1];
      } else {
        throw new Error("Invalid file content format");
      }
    }

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: currentFileState.mimeType,
                data: currentFileState.content,
              },
            },
            { text: promptText },
          ],
        },
      ],
    });

    const response = await result.response;
    const rawOutput = response.text();

    if (!rawOutput) {
      throw new Error("Received empty response from API");
    }

    // Use regex to split the summary and key takeaways
    let summary = "";
    let takeaways: string[] = [];

    console.log("Raw output from API:", rawOutput);

    // Regular expression to match common key takeaways section headers - more inclusive for custom formats
    const keyTakeawaysRegex =
      /(?:^|\n)(?:\*\*)?(?:Key\s+Takeaways?\:?|\d+\.\s*Key\s+Takeaways?\:?|Important\s+Points?\:?|Main\s+Takeaways?\:?|Key\s+Points?\:?)(?:\*\*)?/i;
    console.log("Using key takeaways regex pattern:", keyTakeawaysRegex.source);

    const sections = rawOutput.split(keyTakeawaysRegex);
    console.log("Split sections length:", sections.length);
    console.log("Split sections:", sections);

    if (sections.length >= 2) {
      // Everything before the "Key Takeaways" marker is the summary
      summary = sections[0].trim();
      console.log("Extracted summary:", summary);

      // Extract bullet points from the takeaways section
      const takeawaysSection = sections[1];
      console.log("Raw takeaways section:", takeawaysSection);

      const bulletPointRegex = /(?:^|\n)\s*(?:[•\-\*]|\d+\.)\s*(.+)/gm;
      console.log("Using bullet point regex pattern:", bulletPointRegex.source);

      const matches = [...takeawaysSection.matchAll(bulletPointRegex)];
      console.log("Found bullet point matches:", matches);

      takeaways = matches
        .map((match) => match[1].trim())
        .filter((takeaway) => takeaway.length > 0);

      console.log("Final processed takeaways:", takeaways);
    } else {
      // If no clear split is found, treat everything as summary
      console.log("No clear section split found, using entire text as summary");
      summary = rawOutput;
    }

    console.log("Final output:", {
      summaryLength: summary.length,
      takeawaysCount: takeaways.length,
      summary: summary.substring(0, 100) + "...", // Log first 100 chars of summary
      takeaways,
    });

    // Ensure we have valid content
    if (!summary) {
      throw new Error("Failed to extract summary from response");
    }

    // Clean up summary and takeaways
    summary = summary
      .replace(/^(?:Summary|Overview|Main Points)[:.\s-]*/i, "")
      .trim();

    return {
      summary,
      takeaways: takeaways.length > 0 ? takeaways : [],
    };
  } catch (error) {
    console.error("Error in regenerateSummary:", error);
    throw error;
  } finally {
    // Clear processing flag
    currentFileState.isProcessing = false;
    await chrome.storage.local.set({ currentFileState });
  }
}
