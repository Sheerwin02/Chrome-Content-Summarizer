import React, { useState, useEffect } from "react";
import "./App.css";

const App: React.FC = () => {
  const [mode, setMode] = useState("brief");
  const [fullPage, setFullPage] = useState(false);

  useEffect(() => {
    // Load previously saved options
    chrome.storage.sync.get(["summarizeMode", "fullPage"], (data) => {
      if (data.summarizeMode) setMode(data.summarizeMode);
      if (data.fullPage) setFullPage(data.fullPage);
    });
  }, []);

  const handleConfirmSelection = () => {
    if (fullPage) {
      // Trigger full page summarization
      chrome.runtime.sendMessage(
        { action: "summarizeFullPage", mode },
        (response) => {
          if (response.success) {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon/48.png", // Update this to the correct path of your icon
              title: "Full Page Summarized",
              message: "The full page content has been summarized.",
            });
          } else {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon/48.png",
              title: "Summarization Error",
              message: "Failed to summarize the full page.",
            });
          }
        }
      );
      // Close the popup after triggering full page summarization
      window.close();
    } else {
      // Save selected options to Chrome storage
      chrome.storage.sync.set(
        {
          summarizeMode: mode,
          fullPage: false,
        },
        () => {
          // Show a notification about the selected mode
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon/48.png",
            title: "Summarizer Mode Set",
            message: `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
          });
          // Close the popup after saving options
          window.close();
        }
      );
    }
  };

  return (
    <div className="popup-container">
      <h1 className="title">Summarizer Options</h1>

      <label className="label" htmlFor="mode">
        Choose Summarization Mode:
      </label>
      <select
        id="mode"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="dropdown"
      >
        <option value="brief">Brief</option>
        <option value="detailed">Detailed</option>
        <option value="bullet_points">Bullet Points</option>
      </select>

      <div className="checkbox-container">
        <input
          type="checkbox"
          id="fullPage"
          checked={fullPage}
          onChange={(e) => setFullPage(e.target.checked)}
        />
        <label htmlFor="fullPage">Summarize the entire page</label>
      </div>

      <button className="confirm-button" onClick={handleConfirmSelection}>
        {fullPage ? "Summarize Full Page" : "Confirm Selection"}
      </button>
    </div>
  );
};

export default App;
