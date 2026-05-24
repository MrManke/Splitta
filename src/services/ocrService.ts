import Tesseract from 'tesseract.js';

export const ocrService = {
  /**
   * Main function to process an image and extract the total amount.
   * Uses Hybrid OCR: Azure (Online) or Tesseract (Offline).
   */
  async processImage(file: File): Promise<number | null> {
    let rawText = '';

    if (navigator.onLine) {
      // ONLINE MODE: Google Cloud Vision API
      try {
        const googleVisionKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY;
        if (googleVisionKey) {
          // Convert file to base64
          const base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
              const result = reader.result as string;
              // Remove data URI prefix (e.g. "data:image/jpeg;base64,")
              resolve(result.split(',')[1]);
            };
            reader.onerror = error => reject(error);
          });

          const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${googleVisionKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [
                {
                  image: { content: base64Image },
                  features: [{ type: 'TEXT_DETECTION' }]
                }
              ]
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const textAnnotations = data.responses?.[0]?.textAnnotations;
            rawText = textAnnotations && textAnnotations.length > 0 ? textAnnotations[0].description : '';
          } else {
            console.warn('Google Cloud Vision failed, falling back to Tesseract');
            rawText = await this.runTesseractOffline(file);
          }
        } else {
          // No API key configured, use offline as fallback
          rawText = await this.runTesseractOffline(file);
        }
      } catch (err) {
        console.error('Network error calling Google Vision OCR, falling back to Tesseract', err);
        rawText = await this.runTesseractOffline(file);
      }
    } else {
      // OFFLINE MODE: Tesseract.js
      rawText = await this.runTesseractOffline(file);
    }

    return this.parseReceiptTotal(rawText);
  },

  /**
   * Offline Tesseract execution
   */
  async runTesseractOffline(file: File): Promise<string> {
    try {
      const result = await Tesseract.recognize(file, 'swe+eng');
      return result.data.text;
    } catch (err) {
      console.error('Tesseract OCR Error:', err);
      return '';
    }
  },

  /**
   * Regex-based parsing algorithm to extract the total sum.
   * Heuristics: Proximity and Last-Value principles.
   */
  parseReceiptTotal(rawText: string): number | null {
    if (!rawText) return null;

    // STEP A: Normalization
    let text = rawText.toLowerCase();
    
    // Normalize decimals: replace common mistakes like ',' with '.'
    // We try to find numbers with 2 decimals like 123,45 or 123.45 and ensure they use '.'
    // It's safer to just rely on regex capturing later.

    // Remove noise like common Swedish org numbers (xxxxxx-xxxx)
    text = text.replace(/\d{6}-\d{4}/g, '');
    
    // Remove dates (YYYY-MM-DD or YY-MM-DD)
    text = text.replace(/\d{2,4}-\d{2}-\d{2}/g, '');

    // STEP B: Keyword matching
    const keywords = ['total', 'att betala', 'summa', 'belopp', 'sek', 'eur', 'totalt'];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let candidateAmounts: number[] = [];

    // Helper to extract all valid currency amounts from a string
    const extractAmounts = (str: string): number[] => {
      // Matches 123.45, 123,45, 123.00, etc.
      const regex = /\b\d+[\.,]\d{2}\b/g;
      const matches = str.match(regex);
      if (!matches) return [];
      return matches.map(m => parseFloat(m.replace(',', '.')));
    };

    // STEP C: Filtering (Proximity Principle)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hasKeyword = keywords.some(kw => line.includes(kw));
      
      if (hasKeyword) {
        // Check amounts on the SAME line
        candidateAmounts.push(...extractAmounts(line));
        
        // Check amounts on the NEXT line (often totals are printed on the next line)
        if (i + 1 < lines.length) {
          candidateAmounts.push(...extractAmounts(lines[i + 1]));
        }
      }
    }

    // Filter out candidates that are 0
    candidateAmounts = candidateAmounts.filter(a => a > 0);

    if (candidateAmounts.length > 0) {
      // Highest reasonable amount principle
      return Math.max(...candidateAmounts);
    }

    // STEP C2: Last-Value Principle
    // If no keyword was found or no amounts near keywords, we look at ALL amounts in the receipt.
    // The total is almost always the highest number at the bottom of the receipt.
    let allAmounts: number[] = [];
    lines.forEach(line => {
      // Exclude lines with "moms" or "kvar" if we are blindly grabbing the last value
      if (!line.includes('moms') && !line.includes('kvar')) {
        allAmounts.push(...extractAmounts(line));
      }
    });

    if (allAmounts.length > 0) {
      // The last few amounts on a receipt are usually Total, Cash, Change.
      // We take the max of the last 3 amounts found.
      const lastFew = allAmounts.slice(-3);
      return Math.max(...lastFew);
    }

    return null;
  }
};
