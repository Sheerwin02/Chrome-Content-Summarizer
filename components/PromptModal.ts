import { marked } from "marked";
import { showInAppNotification } from "@/utils/notifications";
import "./sidebar.css";

export async function showKeyTakeawaysModal(takeaways: string[]) {
  // Remove existing modal if any
  const existingModal = document.getElementById("keyTakeawaysModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal container
  const modal = document.createElement("div");
  modal.id = "keyTakeawaysModal";
  modal.className = "modal-overlay";

  // Process key takeaways as Markdown
  const renderedTakeaways = await Promise.all(
    takeaways.map((takeaway) => marked.parse(takeaway))
  );

  // Modal content
  modal.innerHTML = `
      <div class="modal-content">
        <h3 style="font-family: 'San Francisco', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">Key Takeaways</h3>
        <div class="modal-takeaways">
          ${renderedTakeaways
            .map(
              (takeaway) => `
              <div class="modal-tip">
                <span class="tip-icon">💡</span>
                <div class="markdown-content">${takeaway}</div>
              </div>
            `
            )
            .join("")}
        </div>
        <div class="modal-footer">
          <button class="copy-btn">Copy</button>
          <button class="modal-close">Close</button>
        </div>
      </div>
    `;

  // Add functionality to the copy button
  modal.querySelector(".copy-btn")?.addEventListener("click", () => {
    const plainTextTakeaways = takeaways.join("\n\n"); // Convert to plain text for copying
    navigator.clipboard
      .writeText(plainTextTakeaways)
      .then(() => {
        showInAppNotification("Key takeaways copied to clipboard!");
      })
      .catch((error) => {
        console.error("Failed to copy key takeaways:", error);
        showInAppNotification("Failed to copy key takeaways.");
      });
  });

  // Add close functionality
  modal.querySelector(".modal-close")?.addEventListener("click", () => {
    modal.remove();
  });

  // Append modal to body
  document.body.appendChild(modal);
}

export function createCustomizePromptModal() {
  const modal = document.createElement("div");
  modal.id = "customizePromptModal";
  modal.className = "modal-overlay";
  modal.style.display = "none"; // Initially hidden

  modal.innerHTML = `
      <div class="modal-content">
        <h3 style="color: #fff;">Customize Summary Prompt</h3>
        <textarea id="customPromptInput" class="custom-prompt-input" rows="5" placeholder="Enter your custom prompt..."></textarea>
        <div class="modal-buttons">
          <button id="saveCustomPrompt" class="save-btn">Save</button>
          <button id="cancelCustomPrompt" class="cancel-btn">Cancel</button>
        </div>
      </div>
    `;

  // Attach event listeners for Save and Cancel buttons
  modal.querySelector("#saveCustomPrompt")?.addEventListener("click", () => {
    const customPromptInput = document.getElementById(
      "customPromptInput"
    ) as HTMLTextAreaElement;
    if (customPromptInput) {
      const customPrompt = customPromptInput.value.trim();
      if (customPrompt) {
        chrome.storage.sync.set({ customPrompt }, () => {
          showInAppNotification("Custom prompt saved!");
        });
        closeCustomizePromptModal();
      } else {
        showInAppNotification("Please enter a valid prompt.");
      }
    }
  });

  modal
    .querySelector("#cancelCustomPrompt")
    ?.addEventListener("click", closeCustomizePromptModal);

  function closeCustomizePromptModal() {
    const modal = document.getElementById("customizePromptModal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  return modal;
}

export function showCustomizePromptModal() {
  const modal = document.getElementById("customizePromptModal");
  if (modal) {
    modal.style.display = "flex";
  }

  // Load stored customPrompt into the textarea
  chrome.storage.sync.get(["customPrompt"], (data) => {
    const customPromptInput = document.getElementById(
      "customPromptInput"
    ) as HTMLTextAreaElement;
    if (customPromptInput) {
      customPromptInput.value = data.customPrompt || ""; // Set stored value or empty string
    }
  });

  const saveButton = document.getElementById("saveCustomPrompt");
  const cancelButton = document.getElementById("cancelCustomPrompt");

  if (saveButton) {
    saveButton.onclick = () => {
      const customPromptInput = document.getElementById(
        "customPromptInput"
      ) as HTMLTextAreaElement;
      if (customPromptInput) {
        const customPrompt = customPromptInput.value.trim();

        if (customPrompt.length > 500) {
          showInAppNotification("Custom prompt exceeds character limit (500).");
          return;
        }

        if (customPrompt) {
          chrome.storage.sync.set({ customPrompt }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error saving custom prompt:",
                chrome.runtime.lastError
              );
            } else {
              console.log("Custom prompt saved successfully:", customPrompt);
              showInAppNotification("Custom prompt saved!");
            }
          });
          closeCustomizePromptModal();
        } else {
          showInAppNotification("Please enter a valid prompt.");
        }
      }
    };
  }

  if (cancelButton) {
    cancelButton.onclick = closeCustomizePromptModal;
  }
}

export function closeCustomizePromptModal() {
  const modal = document.getElementById("customizePromptModal");
  if (modal) {
    modal.style.display = "none";
  }
}
