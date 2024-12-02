import { showInAppNotification } from "./notifications";

let loadingTimeout: NodeJS.Timeout | null = null;

export function showLoading() {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  let spinner = document.getElementById("loadingSpinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "loadingSpinner";
    spinner.className = "loading-spinner";
    spinner.innerHTML = `
      <div class="spinner-inner"></div>
      <div class="loading-message">Generating summary...</div>
      <button class="cancel-button" onclick="window.cancelCurrentOperation()">Cancel</button>
    `;
    document.body.appendChild(spinner);
  }

  spinner.style.display = "flex";
  requestAnimationFrame(() => {
    if (spinner) {
      spinner.classList.add("visible");
    }
  });

  // Add timeout to show warning if taking too long
  loadingTimeout = setTimeout(() => {
    const message = spinner.querySelector(".loading-message");
    if (message) {
      message.textContent =
        "This is taking longer than usual. You may want to try with a shorter selection.";
    }
  }, 15000);
}

export function hideLoading() {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  const spinner = document.getElementById("loadingSpinner");
  if (spinner) {
    spinner.classList.remove("visible");
    (spinner as any).removeTimeout = setTimeout(() => {
      spinner.style.display = "none";
    }, 300);
  }
}

// Add this to window object for the cancel button
declare global {
  interface Window {
    cancelCurrentOperation: () => void;
  }
}

window.cancelCurrentOperation = () => {
  chrome.runtime.sendMessage({ action: "cancelOperation" }, () => {
    hideLoading();
    showInAppNotification("Operation cancelled");
  });
};

export function copySummaryToClipboard() {
  const contentArea = document.getElementById("summaryContent");
  if (contentArea) {
    const text = contentArea.innerText;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showInAppNotification("Summary copied!");
      })
      .catch((error) => {
        console.error("Failed to copy text: ", error);
        showInAppNotification("Failed to copy text. Please try again.");
      });
  }
}

export function escapeHTML(str: string): string {
  const div = document.createElement("div");
  div.innerText = str;
  return div.innerHTML;
}

export function getFullPageText() {
  try {
    // Fetch all visible text from the body of the page
    const bodyText = document.body.innerText || document.body.textContent || "";
    return bodyText.trim();
  } catch (error) {
    console.error("Error getting full page text:", error);
    return "";
  }
}

export function truncateText(text: string, maxLength = 10000) {
  if (!text) return "";

  if (text.length > maxLength) {
    console.warn(`Text length exceeds ${maxLength} characters. Truncating.`);
    return text.slice(0, maxLength) + "...";
  }
  return text;
}
