export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log("Content script loaded and ready to receive messages.");

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "displaySummary") {
        displaySummary(request.summary);
      }
    });

    function displaySummary(summary: string) {
      // Create a summary box and display it on the page
      const summaryBox = document.createElement("div");
      summaryBox.style.position = "fixed";
      summaryBox.style.bottom = "20px";
      summaryBox.style.right = "20px";
      summaryBox.style.padding = "15px";
      summaryBox.style.backgroundColor = "#f9f9f9";
      summaryBox.style.border = "1px solid #ccc";
      summaryBox.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
      summaryBox.style.zIndex = "1000";
      summaryBox.innerText = summary;

      document.body.appendChild(summaryBox);

      // Remove the summary box after 10 seconds
      setTimeout(() => {
        document.body.removeChild(summaryBox);
      }, 10000);
    }
  },
});
