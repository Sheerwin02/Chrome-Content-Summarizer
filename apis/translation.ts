export async function translateContent(
  sourceLang: string,
  targetLang: string,
  text: string
): Promise<string | null> {
  console.log("Starting translation...");
  console.log("Source Language:", sourceLang);
  console.log("Target Language:", targetLang);
  console.log("Text to Translate:", text);

  // Validate inputs
  if (!sourceLang || !targetLang || !text) {
    console.error("Invalid input for translation.");
    return null;
  }

  if (text.trim() === "") {
    console.error("Text is empty. Translation aborted.");
    return null;
  }

  if (typeof translation?.createTranslator === "function") {
    try {
      const parameters = {
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      };

      console.log("Checking translation support...");
      const canTranslate = await translation.canTranslate(parameters);
      console.log("Translation support:", canTranslate);

      if (canTranslate === "no") {
        console.error(
          "Translation is not supported for the selected language pair."
        );
        showInAppNotification(
          "Translation not supported for the selected languages."
        );
        return null;
      }

      console.log("Creating translator...");
      const translator = await translation.createTranslator(parameters);
      console.log("Translating text...");
      const result = await translator.translate(text);

      if (!result || typeof result !== "string") {
        console.error("Invalid translation result.");
        return null;
      }

      console.log("Translation result:", result);
      return result; // Return the translated text
    } catch (error) {
      console.error("Translation failed:", error);
      showInAppNotification("Translation failed. Please try again later.");
      return null;
    }
  } else {
    console.error("Translator API is not supported in this browser.");
    showInAppNotification(
      "Translation feature is not supported in your browser."
    );
    return null;
  }
}
