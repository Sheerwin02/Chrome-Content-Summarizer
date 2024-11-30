import { GoogleGenerativeAI } from "@google/generative-ai";
import { summarizeDoc } from "@/apis/summarize";
interface FileState {
  content: string;
  mimeType: string;
  isProcessing?: boolean;
}

let currentFileState: FileState | null = null;

export async function handleFileUploadAndSummarize(
  file: File | { name: string; type: string; data: string },
  apiKey: string,
  p0: (response: any) => void
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
    return summarizeDoc(summarizeMode || "brief", genAI);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing file:", errorMessage);
    throw new Error(`Error processing document: ${errorMessage}`);
  }
}

export function getCurrentFileState(): FileState | null {
  return currentFileState;
}
