import { GoogleGenerativeAI } from "@google/generative-ai";
import { summarizeDoc } from "@/apis/summarize";

interface FileState {
  content: string;
  mimeType: string;
  fileName: string;
  originalContent?: string;
  contentLength?: number;
  isProcessing?: boolean;
}

// Move this to module scope
let globalFileState: FileState | null = null;

export async function handleFileUploadAndSummarize(
  file: File | { name: string; type: string; data: string },
  apiKey: string,
  progressCallback: (response: any) => void
): Promise<{ summary: string; takeaways: string[] }> {
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    console.log(
      "Processing file:",
      file instanceof File ? file.name : file.name
    );

    let fileState: FileState;

    if (file instanceof File) {
      // Read file content
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          let result = reader.result as string;
          if (file.type === "text/plain") {
            resolve(result);
          } else {
            const base64 = result.split(",")[1] || result;
            resolve(base64);
          }
        };
        reader.onerror = reject;

        if (file.type === "text/plain") {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      });

      fileState = {
        mimeType: file.type || "text/plain",
        content: content,
        fileName: file.name,
        originalContent: file.type === "text/plain" ? content : undefined,
        contentLength: content.length,
        isProcessing: false,
      };
    } else {
      fileState = {
        mimeType: file.type,
        content: file.data.includes(",") ? file.data.split(",")[1] : file.data,
        fileName: file.name,
        originalContent: file.type === "text/plain" ? file.data : undefined,
        contentLength: file.data.length,
        isProcessing: false,
      };
    }

    // Store in global state
    globalFileState = fileState;

    console.log("File state created:", {
      mimeType: fileState.mimeType,
      fileName: fileState.fileName,
      contentLength: fileState.contentLength,
      hasOriginalContent: !!fileState.originalContent,
    });

    // Store in chrome storage with validation
    const storageState = {
      ...fileState,
      // Ensure we're not storing undefined values
      contentLength: fileState.contentLength || fileState.content.length,
      isProcessing: false,
    };

    await chrome.storage.local.set({
      currentFileState: storageState,
    });

    console.log("File state stored in chrome.storage.local");

    // Initial summary generation
    const { summarizeMode } = await chrome.storage.sync.get("summarizeMode");
    const mode = summarizeMode || "brief";

    // Pass the complete file state to summarizeDoc
    return summarizeDoc(mode, genAI, {
      ...fileState,
      contentLength: fileState.contentLength ?? fileState.content.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing file:", errorMessage);

    // Clear state on error
    globalFileState = null;
    await chrome.storage.local.remove("currentFileState");

    throw new Error(`Error processing document: ${errorMessage}`);
  }
}

// Add helper function to get current file state
export async function getCurrentFileState(): Promise<FileState | null> {
  if (globalFileState) {
    return globalFileState;
  }

  const { currentFileState } = await chrome.storage.local.get(
    "currentFileState"
  );
  return currentFileState || null;
}

// Add helper function to clear file state
export async function clearFileState(): Promise<void> {
  globalFileState = null;
  await chrome.storage.local.remove("currentFileState");
}
