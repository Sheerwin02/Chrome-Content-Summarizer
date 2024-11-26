import { GoogleGenerativeAI } from "@google/generative-ai";
import { summarizeText } from "./summarize";

interface FileState {
  content: string;
  mimeType: string;
  isProcessing?: boolean;
}

let currentFileState: FileState | null = null;

export async function handleFileUploadAndSummarize(
  file: File | { name: string; type: string; data: string },
  apiKey: string
): Promise<{ summary: string; takeaways: string[] }> {
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    console.log(
      "Processing file:",
      typeof file === "string" ? "base64 string" : file.name
    );

    // Store file state
    if (file instanceof File) {
      currentFileState = {
        mimeType: file.type || "application/pdf",
        content: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
        isProcessing: false,
      };
    } else {
      currentFileState = {
        mimeType: file.type,
        content: file.data.includes(",") ? file.data.split(",")[1] : file.data,
        isProcessing: false,
      };
    }

    // Store current file state in chrome storage
    await chrome.storage.local.set({ currentFileState });

    // Initial summary generation
    const { summarizeMode } = await chrome.storage.sync.get("summarizeMode");
    return regenerateSummary(summarizeMode || "brief", genAI);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing file:", errorMessage);
    throw new Error(`Error processing document: ${errorMessage}`);
  }
}

async function regenerateSummary(
  mode: string,
  genAI: any
): Promise<{ summary: string; takeaways: string[] }> {
  if (!currentFileState || currentFileState.isProcessing) {
    throw new Error("No file content available or processing in progress");
  }

  currentFileState.isProcessing = true;

  try {
    let promptText = "";
    if (mode === "customize") {
      const { customPrompt } = await chrome.storage.sync.get("customPrompt");
      promptText = customPrompt?.trim()
        ? `${customPrompt.trim()}\nAnalyze the document and provide:\n1. A clear summary\n2. Key takeaways as bullet points`
        : "Analyze this document and provide:\n1. A clear summary\n2. Key takeaways as bullet points";
    } else {
      promptText =
        mode === "detailed"
          ? "Provide a detailed analysis of the document with:\n1. A comprehensive summary\n2. Key takeaways as bullet points"
          : mode === "bullet_points"
          ? "Create a bullet-point analysis with:\n1. Main points\n2. Key takeaways as separate bullet points"
          : "Provide a concise analysis with:\n1. A brief summary\n2. Key takeaways as bullet points";
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
            {
              text: promptText,
            },
          ],
        },
      ],
    });

    const response = await result.response;
    const rawOutput = response.text();

    if (!rawOutput) {
      throw new Error("Received empty response from API");
    }

    // Process the output
    const lines = rawOutput.split("\n");
    const takeaways: string[] = [];
    const summaryLines: string[] = [];

    let isTakeaway = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (
        trimmedLine.toLowerCase().includes("key takeaway") ||
        trimmedLine.match(/^[•\-\*]|^\d+\./) ||
        isTakeaway
      ) {
        isTakeaway = true;
        if (
          trimmedLine &&
          !trimmedLine.toLowerCase().includes("key takeaway")
        ) {
          takeaways.push(trimmedLine.replace(/^[•\-\*]\s*|\d+\.\s*/, ""));
        }
      } else {
        summaryLines.push(trimmedLine);
      }
    }

    const summary = summaryLines.join("\n").trim();
    return { summary, takeaways };
  } catch (error) {
    console.error("Error in regenerateSummary:", error);
    throw error;
  } finally {
    currentFileState.isProcessing = false;
  }
}

export function getCurrentFileState(): FileState | null {
  return currentFileState;
}

export function clearFileState(): void {
  currentFileState = null;
  chrome.storage.local.remove("currentFileState");
}
