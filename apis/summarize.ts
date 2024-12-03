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
            const abortController = new AbortController();
            const { summary, takeaways } = await summarizeText(
              fullPageText,
              mode,
              abortController.signal
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
  mode: string,
  signal: AbortSignal
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
        const abortController = new AbortController();
        const summary = await summarizeText(
          fullPageText,
          mode,
          abortController.signal
        );
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

    const abortController = new AbortController();
    summarizeText(textToSummarize, mode, abortController.signal)
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

interface FileState {
  fileName: string;
  content: string;
  contentLength: number;
  mimeType: string;
  originalContent?: string;
}

export async function summarizeDoc(
  mode: string,
  genAI: any,
  fileState?: FileState
): Promise<{ summary: string; takeaways: string[] }> {
  // If fileState isn't provided, try to get it from storage
  if (!fileState) {
    const { currentFileState } = await chrome.storage.local.get(
      "currentFileState"
    );
    fileState = currentFileState;
  }

  if (!fileState || !fileState.content) {
    throw new Error("No file content available");
  }

  console.log(
    `Processing ${fileState.fileName} (${fileState.contentLength} bytes)`
  );

  try {
    let content = fileState.content;

    // For text files, use original content if available
    if (fileState.mimeType === "text/plain" && fileState.originalContent) {
      content = fileState.originalContent;
    } else if (fileState.mimeType === "text/plain") {
      // Handle potential base64 encoding
      if (content.match(/^[A-Za-z0-9+/=]+$/)) {
        content = atob(content);
      } else if (content.includes("base64,")) {
        const base64Data = content.split("base64,")[1];
        content = atob(base64Data);
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const promptText = generatePromptText(mode);

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            fileState.mimeType === "text/plain"
              ? { text: content + "\n\n" + promptText }
              : {
                  inlineData: {
                    mimeType: fileState.mimeType,
                    data: content,
                  },
                },
            fileState.mimeType !== "text/plain" ? { text: promptText } : null,
          ].filter(Boolean),
        },
      ],
    });

    const response = await result.response;
    const rawOutput = response.text();

    if (!rawOutput) {
      throw new Error("Received empty response from API");
    }

    return processOutput(rawOutput);
  } catch (error) {
    console.error(`Error processing ${fileState.fileName}:`, error);
    throw error;
  }
}

function generatePromptText(mode: string): string {
  switch (mode) {
    case "detailed":
      return `Provide a detailed analysis of the document with:
        1. A comprehensive summary section focusing on the main content
        2. A separate key takeaways section with actionable bullet points`;
    case "bullet_points":
      return `Analyze the document and provide:
        1. A summary section in clear bullet points
        2. A separate key takeaways section with actionable insights`;
    default:
      return `Provide a concise analysis with:
        1. A brief summary section of the main points
        2. A separate key takeaways section with essential bullet points`;
  }
}

function processOutput(rawOutput: string): {
  summary: string;
  takeaways: string[];
} {
  const keyTakeawaysRegex =
    /(?:^|\n)(?:\*\*)?(?:Key\s+Takeaways?\:?|\d+\.\s*Key\s+Takeaways?\:?|Important\s+Points?\:?|Main\s+Takeaways?\:?|Key\s+Points?\:?)(?:\*\*)?/i;
  const sections = rawOutput.split(keyTakeawaysRegex);

  let summary = "";
  let takeaways: string[] = [];

  if (sections.length >= 2) {
    summary = sections[0].trim();
    const takeawaysSection = sections[1];
    const bulletPointRegex = /(?:^|\n)\s*(?:[•\-\*]|\d+\.)\s*(.+)/gm;
    const matches = [...takeawaysSection.matchAll(bulletPointRegex)];
    takeaways = matches
      .map((match) => match[1].trim())
      .filter((takeaway) => takeaway.length > 0);
  } else {
    summary = rawOutput;
  }

  return {
    summary: summary
      .replace(/^(?:Summary|Overview|Main Points)[:.\s-]*/i, "")
      .trim(),
    takeaways: takeaways.length > 0 ? takeaways : [],
  };
}
