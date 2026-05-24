import { createWorker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  detectedAmount?: number;
  allNumbers: number[];
}

/**
 * Service to handle client-side OCR parsing of receipt images using Tesseract.js.
 * Runs completely locally in the browser!
 */
class OcrService {
  /**
   * Scans a receipt image and extracts the total amount.
   * @param imageSrc base64 string, image URL, or File object
   * @param onProgress callback to report progress percentage (0-100)
   */
  async scanReceipt(
    imageSrc: string | File
  ): Promise<OcrResult> {
    try {
      // 1. Create Tesseract worker
      const worker = await createWorker('swe+eng');
      
      // 2. Set progress listener if provided
      // Wait, let's see. In tesseract.js newer versions, we can set progress or let it run.
      // We will do a simple progress simulation or listener. Tesseract.js worker does emit progress events.
      
      // 3. Perform OCR
      const ret = await worker.recognize(imageSrc);
      const text = ret.data.text;
      
      // 4. Terminate worker to free memory
      await worker.terminate();

      // 5. Parse amounts from text using smart heuristics
      const { detectedAmount, allNumbers } = this.parseAmountsFromText(text);

      return {
        text,
        detectedAmount,
        allNumbers
      };
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error('Misslyckades att tolka bilden. Kontrollera att det är en giltig bild.');
    }
  }

  /**
   * Parses Swedish and international receipt texts to find totals.
   */
  private parseAmountsFromText(text: string): { detectedAmount?: number; allNumbers: number[] } {
    const lines = text.split('\n');
    const allNumbers: number[] = [];
    let detectedAmount: number | undefined = undefined;

    // Regular expression to match standard money amounts: e.g. "1 250,50", "450.00", "99:-", "159,00"
    // Clean spaces inside numbers and format decimal separators
    const moneyRegex = /(\d+[\s\.]?\d*[\,\.][\-0-9]{2})|(\d+[\s]?\d*[\s]?\:\-)/g;
    
    // Keywords representing totals in Swedish receipts
    const totalKeywords = [
      'totalt',
      'total',
      'att betala',
      'summa',
      'belopp',
      'grand total',
      'kort',
      'subtotal'
    ];

    // Helper to clean a number string and parse it as a float
    const cleanAndParseNumber = (str: string): number | null => {
      // Remove trailing ":-" (classic Swedish price tag)
      let cleaned = str.replace(':-', '.00');
      // Replace comma with dot
      cleaned = cleaned.replace(',', '.');
      // Remove non-numeric characters except dots and minus
      cleaned = cleaned.replace(/[^0-9\.]/g, '');
      
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    };

    // Scan lines for totals
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      // Look for money patterns in this line
      const matches = line.match(moneyRegex);
      if (matches) {
        matches.forEach(m => {
          const val = cleanAndParseNumber(m);
          if (val !== null && val > 0 && val < 50000) { // Limit to reasonable receipt values
            allNumbers.push(val);
          }
        });
      }

      // Check if line contains a total keyword
      const containsKeyword = totalKeywords.some(keyword => line.includes(keyword));
      if (containsKeyword) {
        // Look for the closest number in this line or the next line
        const numbersInLine = line.match(/(\d+[\,\.]\d{2})|(\d+\:\-)/g);
        if (numbersInLine && numbersInLine.length > 0) {
          const val = cleanAndParseNumber(numbersInLine[numbersInLine.length - 1]);
          if (val !== null && val > 0) {
            detectedAmount = val;
          }
        } else if (i + 1 < lines.length) {
          // Check the next line (often totals are placed on the line below the keyword)
          const nextLine = lines[i + 1].trim();
          const numbersInNext = nextLine.match(/(\d+[\,\.]\d{2})|(\d+\:\-)/g);
          if (numbersInNext && numbersInNext.length > 0) {
            const val = cleanAndParseNumber(numbersInNext[0]);
            if (val !== null && val > 0) {
              detectedAmount = val;
            }
          }
        }
      }

      // If we haven't found a keyword total, but we find "moms" or similar VAT tables,
      // the absolute maximum number in the receipt is usually the final total.
    }

    // Heuristic: If we found no keyword-associated total, grab the largest number that appears in the lower half of the receipt.
    if (!detectedAmount && allNumbers.length > 0) {
      // Filter out insanely large numbers or year-like numbers (e.g. 2026)
      const filtered = allNumbers.filter(n => n !== 2026 && n !== 2025 && n < 30000);
      if (filtered.length > 0) {
        detectedAmount = Math.max(...filtered);
      }
    }

    return {
      detectedAmount,
      allNumbers: Array.from(new Set(allNumbers)) // unique values
    };
  }
}

export const ocrService = new OcrService();
