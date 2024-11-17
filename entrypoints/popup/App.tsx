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

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    chrome.storage.sync.set({ summarizeMode: newMode }, () => {
      console.log(`Summarize mode updated to: ${newMode}`);
    });
  };

  const handleFullPageSummarization = () => {
    chrome.runtime.sendMessage({ action: "summarizeFullPage" }, (response) => {
      if (response?.success) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon/48.png",
          title: "Full Page Summarized",
          message: "The full page content has been summarized.",
        });
      } else {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon/48.png",
          title: "Error",
          message: "Failed to summarize the full page.",
        });
      }
    });
    window.close(); // Close popup after action
  };

  const handleConfirmSelection = () => {
    chrome.storage.sync.set(
      {
        summarizeMode: mode,
        fullPage,
      },
      () => {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon/48.png",
          title: "Options Saved",
          message: `Mode set to ${
            mode.charAt(0).toUpperCase() + mode.slice(1)
          }.`,
        });
      }
    );

    if (fullPage) {
      handleFullPageSummarization();
    } else {
      window.close(); // Close popup after saving options
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
        onChange={(e) => handleModeChange(e.target.value)}
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
