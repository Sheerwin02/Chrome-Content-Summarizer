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
  progressCallback: (response: any) => void
): Promise<{ summary: string; takeaways: string[] }> {
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    console.log(
      "Processing file:",
      file instanceof File ? file.name : file.name
    );

    // Create file state
    let currentFileState: {
      content: string;
      mimeType: string;
      fileName: string;
      originalContent?: string; // Add this to store original content
    };

    if (file instanceof File) {
      // Read file content
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          let result = reader.result as string;
          if (file.type === "text/plain") {
            // Store both original and processed content for text files
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

      currentFileState = {
        mimeType: file.type || "text/plain",
        content: content,
        fileName: file.name,
        originalContent: file.type === "text/plain" ? content : undefined,
      };
    } else {
      currentFileState = {
        mimeType: file.type,
        content: file.data.includes(",") ? file.data.split(",")[1] : file.data,
        fileName: file.name,
        originalContent: file.type === "text/plain" ? file.data : undefined,
      };
    }

    console.log("File state created:", {
      mimeType: currentFileState.mimeType,
      fileName: currentFileState.fileName,
      contentLength: currentFileState.content.length,
      hasOriginalContent: !!currentFileState.originalContent,
    });

    // Store complete file state in chrome storage
    await chrome.storage.local.set({ currentFileState });
    console.log("File state stored in chrome.storage.local");

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
