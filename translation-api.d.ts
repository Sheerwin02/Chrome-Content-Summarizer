declare const translation: {
    createTranslator: (parameters: { sourceLanguage: string; targetLanguage: string }) => Promise<{
      translate: (text: string) => Promise<string>;
    }>;
    canTranslate: (parameters: { sourceLanguage: string; targetLanguage: string }) => Promise<'no' | 'readily' | 'after-download'>;
  };
  