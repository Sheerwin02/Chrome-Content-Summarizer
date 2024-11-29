import { showInAppNotification } from "./notifications";

export function showLoading() {
  const spinner = document.getElementById("loadingSpinner");
  if (spinner) {
    spinner.classList.add("visible");
  }
}

export function hideLoading() {
  const spinner = document.getElementById("loadingSpinner");
  if (spinner) {
    spinner.classList.remove("visible");
  }
}

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
      });
  }
}

export function escapeHTML(str: string): string {
  const div = document.createElement("div");
  div.innerText = str;
  return div.innerHTML;
}

export function getFullPageText() {
  // Fetch all visible text from the body of the page
  const bodyText = document.body.innerText || document.body.textContent || "";
  return bodyText.trim();
}

export function truncateText(text: string, maxLength = 10000) {
  if (text.length > maxLength) {
    console.warn(`Text length exceeds ${maxLength} characters. Truncating.`);
    return text.slice(0, maxLength) + "...";
  }
  return text;
}
