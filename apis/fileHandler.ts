import { GoogleGenerativeAI } from "@google/generative-ai";

// Use a module-level listener cleanup function
let cleanupListener: (() => void) | null = null;

export async function handleFileUploadAndSummarize(
  file: File | { name: string; type: string; data: string },
  apiKey: string
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  let currentBase64Content: string;
  let currentMimeType: string;

  try {
    console.log(
      "Processing file:",
      typeof file === "string" ? "base64 string" : file.name
    );

    // Process the file and get content
    if (file instanceof File) {
      currentMimeType = file.type || "application/pdf";
      currentBase64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      currentMimeType = file.type;
      currentBase64Content = file.data.includes(",")
        ? file.data.split(",")[1]
        : file.data;
    }

    if (!currentBase64Content) {
      throw new Error("Failed to get file content");
    }

    // Validate PDF if applicable
    if (currentMimeType === "application/pdf") {
      try {
        const decodedStart = atob(currentBase64Content.substring(0, 100));
        if (!decodedStart.includes("%PDF-")) {
          throw new Error("Invalid PDF format: Missing PDF header");
        }
      } catch (e) {
        throw new Error("Invalid base64 encoding or corrupted PDF data");
      }
    }

    // Clean up any existing listener
    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }

    // Set up new listener with cleanup
    const handleModeChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "sync" && changes.summarizeMode) {
        const newMode = changes.summarizeMode.newValue || "brief";
        console.log("Summarize mode changed:", newMode);
        regenerateSummary(newMode);
      }
    };

    chrome.storage.onChanged.addListener(handleModeChange);

    // Store cleanup function
    cleanupListener = () => {
      chrome.storage.onChanged.removeListener(handleModeChange);
    };

    // Get initial mode and generate summary
    const summarizeMode = await new Promise<string>((resolve) => {
      chrome.storage.sync.get(["summarizeMode"], (data) => {
        resolve(data.summarizeMode || "brief");
      });
    });

    return regenerateSummary(summarizeMode);

    async function regenerateSummary(mode: string): Promise<string> {
      const promptText =
        mode === "detailed"
          ? "Provide a detailed summary of the attached document with all necessary context and explanations."
          : mode === "bullet_points"
          ? "Create a bullet-point summary of the attached document."
          : "Summarize the attached document in a brief and concise manner.";

      const parts = [
        {
          inlineData: {
            mimeType: currentMimeType,
            data: currentBase64Content,
          },
        },
        { text: promptText },
      ];

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(parts);
      const response = await result.response;

      if (!response.text()) {
        throw new Error("Received empty response from the API");
      }

      // Send summary to active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: "displaySummary",
            summary: response.text(),
            mode,
          });
        }
      });

      return response.text();
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing file:", errorMessage);
    throw new Error(`Error processing document: ${errorMessage}`);
  }
}
