import { GoogleGenerativeAI } from "@google/generative-ai";
import mime from "mime-types";

function isBase64(str: string): boolean {
  try {
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
  } catch (e) {
    return false;
  }
}

export async function handleFileUploadAndSummarize(
  file: File | { name: string; type: string; data: string },
  apiKey: string
) {
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    console.log(
      "Processing file:",
      typeof file === "string" ? "base64 string" : file.name
    );

    let base64Content: string;
    let mimeType: string;

    // Handle both File objects and pre-encoded base64 data
    if (file instanceof File) {
      mimeType = file.type || "application/pdf";
      base64Content = await new Promise<string>((resolve, reject) => {
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
      mimeType = file.type;
      base64Content = file.data;

      if (base64Content.includes(",")) {
        base64Content = base64Content.split(",")[1];
      }
    }

    if (!base64Content) {
      throw new Error("Failed to get file content");
    }

    console.log("MIME type:", mimeType);
    console.log("Base64 content length:", base64Content.length);

    if (mimeType === "application/pdf") {
      try {
        const decodedStart = atob(base64Content.substring(0, 100));
        if (!decodedStart.includes("%PDF-")) {
          throw new Error("Invalid PDF format: Missing PDF header");
        }
      } catch (e) {
        throw new Error("Invalid base64 encoding or corrupted PDF data");
      }
    }

    // Retrieve and listen for summarizeMode changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes.summarizeMode) {
        const newMode = changes.summarizeMode.newValue || "brief";
        console.log("Summarize mode changed:", newMode);
        regenerateSummary(newMode);
      }
    });

    const summarizeMode = await new Promise<string>((resolve) => {
      chrome.storage.sync.get(["summarizeMode"], (data) => {
        resolve(data.summarizeMode || "brief");
      });
    });

    return regenerateSummary(summarizeMode);

    // Function to regenerate summary based on mode
    async function regenerateSummary(mode: string): Promise<string> {
      let promptText = "";
      switch (mode) {
        case "detailed":
          promptText = `Provide a detailed summary of the attached document with all necessary context and explanations.`;
          break;

        case "bullet_points":
          promptText = `Create a bullet-point summary of the attached document.`;
          break;

        default:
          promptText = `Summarize the attached document in a brief and concise manner.`;
      }

      const parts = [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Content,
          },
        },
        {
          text: promptText,
        },
      ];

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(parts);
      const response = await result.response;

      if (!response.text()) {
        throw new Error("Received empty response from the API");
      }

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

      console.log("Generated summary:", response.text());
      return response.text();
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error processing file:", error.message);
      throw new Error(`Error processing document: ${error.message}`);
    } else {
      throw new Error("Error processing document: Unknown error");
    }
  }
}
