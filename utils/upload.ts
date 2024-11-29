let isProcessing = false; // Flag to prevent multiple uploads

export function uploadDocument(file: Blob) {
  if (isProcessing) {
    console.log("Upload already in progress.");
    return;
  }

  isProcessing = true;
  showLoading(); // Show loading at start of upload

  const reader = new FileReader();

  reader.onload = () => {
    const base64Data = reader.result as string;

    chrome.runtime.sendMessage(
      {
        action: "uploadDocument",
        file: {
          name: (file as File).name,
          type: file.type || "application/pdf",
          data: base64Data,
        },
      },
      async (response) => {
        try {
          console.log("Response from background:", response);
          if (response && response.success && response.summary) {
            await displaySummary(
              response.summary,
              response.takeaways || [],
              "uploaded"
            );
            showInAppNotification(
              "Document uploaded and summarized successfully!"
            );
          } else if (response && !response.success) {
            showInAppNotification(
              `Error: ${response.error}. Please try again.`
            );
          } else {
            showInAppNotification(
              "Failed to process the document. Please try again."
            );
          }
        } catch (error) {
          console.error("Error handling response:", error);
          showInAppNotification(
            "An error occurred while processing the document."
          );
        } finally {
          isProcessing = false;
          hideLoading(); // Hide loading after everything is done
        }
      }
    );
  };

  reader.onerror = (error) => {
    console.error("Error reading file:", error);
    showInAppNotification("Failed to read the file. Please try again.");
    isProcessing = false;
    hideLoading(); // Hide loading if file reading fails
  };

  reader.readAsDataURL(file);
}
