let isProcessing = false; // Flag to prevent multiple uploads

      export function uploadDocument(file: Blob) {
        if (isProcessing) {
          console.log("Upload already in progress.");
          return; // Prevent further uploads if already processing
        }

        isProcessing = true; // Set flag to true when upload starts

        const reader = new FileReader();

        reader.onload = () => {
          const base64Data = reader.result as string;

          chrome.runtime.sendMessage(
            {
              action: "uploadDocument",
              file: {
                name: (file as File).name,
                type: file.type || "application/pdf",
                data: base64Data, // Send the complete data URL
              },
            },
            (response) => {
              console.log("Response from background:", response);
              if (response && response.success && response.summary) {
                displaySummary(
                  response.summary,
                  response.takeaways,
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

              // Ensure flag is reset only after processing is complete
              isProcessing = false;
            }
          );
        };

        // Reset flag if reading the file fails
        reader.onerror = () => {
          console.log("Error reading file.");
          isProcessing = false; // Reset flag if file reading fails
        };

        // Read file as Data URL (Base64)
        reader.readAsDataURL(file);
      }
      