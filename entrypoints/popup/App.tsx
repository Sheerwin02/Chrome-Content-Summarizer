import React, { useState, useEffect } from "react";
import "./App.css";

const App: React.FC = () => {
  const [mode, setMode] = useState("brief");
  const [fullPage, setFullPage] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showTranslationSettings, setShowTranslationSettings] = useState(false);
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("es");
  const [translationApiEnabled, setTranslationApiEnabled] = useState(true); // New state

  useEffect(() => {
    chrome.storage.sync.get(
      ["summarizeMode", "fullPage", "customPrompt", "sourceLang", "targetLang"],
      (data) => {
        if (data.summarizeMode) setMode(data.summarizeMode);
        if (data.fullPage) setFullPage(data.fullPage);
        if (data.customPrompt) setCustomPrompt(data.customPrompt);
        if (data.sourceLang) setSourceLang(data.sourceLang);
        if (data.targetLang) setTargetLang(data.targetLang);
      }
    );

    // Check if the translation API is available
    try {
      // Check for the translation API (assuming `translation.createTranslator` is used)
      if (!translation?.createTranslator) {
        throw new Error("Translation API is not enabled.");
      }
    } catch (error) {
      console.warn("Translation API not enabled:", error);
      setTranslationApiEnabled(false); // Set state to false if the API is not available
    }
  }, []);

  const toggleTranslationSettings = () => {
    setShowTranslationSettings(!showTranslationSettings);
  };

  const saveTranslationSettings = () => {
    chrome.storage.sync.set({ sourceLang, targetLang }, () => {
      console.log("Translation settings saved.");
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon/48.png",
        title: "Settings Saved",
        message: "Translation settings have been saved.",
      });
    });
  };

  return (
    <div
      className="popup-container"
      style={{
        maxHeight: showTranslationSettings ? "450px" : "320px", // Dynamically adjust height
        transition: "max-height 0.3s ease",
      }}
    >
      {!translationApiEnabled && (
        <div className="warning">
          <p>
            The Translation API is disabled. Please enable it in{" "}
            <a href="chrome://flags" target="_blank" rel="noopener noreferrer">
              chrome://flags
            </a>{" "}
            and restart your browser.
          </p>
        </div>
      )}

      <h1 className="title">Summarizer Options</h1>

      <label className="label" htmlFor="mode">
        Choose Summarization Mode:
      </label>
      <select
        id="mode"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="dropdown"
        aria-label="Choose Summarization Mode"
      >
        <option value="brief">Brief</option>
        <option value="detailed">Detailed</option>
        <option value="bullet_points">Bullet Points</option>
        <option value="customize">Customize</option>
      </select>

      <div className="checkbox-container">
        <input
          type="checkbox"
          id="fullPage"
          checked={fullPage}
          onChange={(e) => setFullPage(e.target.checked)}
          aria-label="Summarize the entire page"
        />
        <label htmlFor="fullPage">Summarize the entire page</label>
      </div>

      <div className="translation-button-container">
        <div
          className="translation-settings-tab"
          onClick={toggleTranslationSettings}
        >
          Translation Settings{" "}
          {showTranslationSettings ? <span>▲</span> : <span>▼</span>}
        </div>

        {showTranslationSettings && (
          <div className="translation-settings">
            <label className="label" htmlFor="sourceLang">
              Source Language:
            </label>
            <select
              id="sourceLang"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="dropdown"
              aria-label="Source Language"
            >
              <option value="en">English</option>
              <option value="zh">Mandarin Chinese (Simplified)</option>
              <option value="zh-Hant">Taiwanese Mandarin (Traditional)</option>
              <option value="ja">Japanese</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="es">Spanish</option>
              <option value="tr">Turkish</option>
              <option value="hi">Hindi</option>
              <option value="vi">Vietnamese</option>
              <option value="bn">Bengali</option>
            </select>

            <label className="label" htmlFor="targetLang">
              Target Language:
            </label>
            <select
              id="targetLang"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="dropdown"
              aria-label="Target Language"
            >
              <option value="en">English</option>
              <option value="zh">Mandarin Chinese (Simplified)</option>
              <option value="zh-Hant">Taiwanese Mandarin (Traditional)</option>
              <option value="ja">Japanese</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="es">Spanish</option>
              <option value="tr">Turkish</option>
              <option value="hi">Hindi</option>
              <option value="vi">Vietnamese</option>
              <option value="bn">Bengali</option>
            </select>

            <button
              className="save-settings-button"
              onClick={saveTranslationSettings}
              aria-label="Save Translation Settings"
            >
              Save Translation Settings
            </button>
          </div>
        )}
      </div>

      <button
        className="confirm-button"
        aria-label="Confirm Selection"
        onClick={() => console.log("Confirmed Selection")}
      >
        Confirm Selection
      </button>
    </div>
  );
};

export default App;
