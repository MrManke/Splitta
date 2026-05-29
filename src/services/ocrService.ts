import Tesseract from 'tesseract.js';

export const ocrService = {
  /**
   * Main function to process an image or PDF and extract the total amount.
   * Uses Hybrid OCR: Google Cloud Vision (Online) or Tesseract (Offline).
   */
  async processImage(file: File): Promise<number | null> {
    let rawText = '';
    const isPdf = file.type === 'application/pdf';

    if (navigator.onLine) {
      // ONLINE MODE: Google Cloud Vision API
      try {
        const googleVisionKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY;
        if (googleVisionKey) {
          if (isPdf) {
            // For PDFs, render page 1 to canvas then treat as image
            const imageFile = await this.pdfToImageFile(file);
            if (imageFile) {
              return this.processImage(imageFile);
            }
            // If PDF rendering fails, try Tesseract on original (won't work well but better than nothing)
            rawText = await this.runTesseractOffline(file);
          } else {
            // Convert image file to base64
            const base64Image = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => {
                const result = reader.result as string;
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
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
                  }
                ]
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';
              const legacyText = data.responses?.[0]?.textAnnotations?.[0]?.description || '';
              rawText = fullText || legacyText;
            } else {
              console.warn('Google Cloud Vision failed, falling back to Tesseract');
              rawText = await this.runTesseractOffline(file);
            }
          }
        } else {
          // No API key: render PDF to image first, then run Tesseract
          if (isPdf) {
            const imageFile = await this.pdfToImageFile(file);
            rawText = await this.runTesseractOffline(imageFile || file);
          } else {
            rawText = await this.runTesseractOffline(file);
          }
        }
      } catch (err) {
        console.error('OCR error, falling back to Tesseract', err);
        rawText = await this.runTesseractOffline(file);
      }
    } else {
      // OFFLINE MODE: Tesseract.js (render PDF to image first)
      if (isPdf) {
        const imageFile = await this.pdfToImageFile(file);
        rawText = await this.runTesseractOffline(imageFile || file);
      } else {
        rawText = await this.runTesseractOffline(file);
      }
    }

    if (!rawText.trim()) {
      throw new Error('NO_TEXT_FOUND');
    }

    return this.parseReceiptTotal(rawText);
  },

  /**
   * Render ALL pages of a PDF (up to MAX_PAGES) and stitch them vertically
   * into one tall PNG image for OCR processing.
   * Uses dynamic import of pdfjs-dist from CDN.
   */
  async pdfToImageFile(pdfFile: File): Promise<File | null> {
    const MAX_PAGES = 6; // Safety limit to avoid memory issues
    const SCALE = 2.0;   // High-res for better OCR accuracy

    try {
      // Dynamically load pdf.js from CDN to avoid Vite bundler issues
      if (!(window as any).pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'));
          document.head.appendChild(script);
        });
      }

      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = Math.min(pdf.numPages, MAX_PAGES);

      console.log(`PDF has ${pdf.numPages} page(s), rendering ${numPages}`);

      // Render each page to its own temporary canvas
      const pageCanvases: HTMLCanvasElement[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx as any, canvas, viewport } as any).promise;
        pageCanvases.push(canvas);
      }

      // Stitch all pages vertically into one tall canvas
      const totalWidth = Math.max(...pageCanvases.map(c => c.width));
      const totalHeight = pageCanvases.reduce((sum, c) => sum + c.height, 0);
      const stitched = document.createElement('canvas');
      stitched.width = totalWidth;
      stitched.height = totalHeight;
      const stitchedCtx = stitched.getContext('2d')!;

      let yOffset = 0;
      for (const pageCanvas of pageCanvases) {
        stitchedCtx.drawImage(pageCanvas, 0, yOffset);
        yOffset += pageCanvas.height;
      }

      console.log(`Stitched PDF image: ${totalWidth}x${totalHeight}px`);

      // Convert stitched canvas to blob/File
      return new Promise<File | null>((resolve) => {
        stitched.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], 'pdf-all-pages.png', { type: 'image/png' }));
          } else {
            resolve(null);
          }
        }, 'image/png');
      });
    } catch (err) {
      console.error('PDF rendering failed:', err);
      return null;
    }
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
   * Advanced regex-based parsing algorithm to extract the total/paid amount.
   * Strategy:
   *   1. Clean noise (org-numbers, dates, phone numbers)
   *   2. Search for strong keywords ("att betala", "totalt", "paid", etc.)
   *      and extract the amount immediately following them.
   *   3. Fallback: pick the highest decimal amount found anywhere in the text.
   */
  parseReceiptTotal(rawText: string): number | null {
    if (!rawText) return null;

    // STEP A: Clean up the text
    let text = rawText.toLowerCase();

    // Remove noise: Swedish org numbers (xxxxxx-xxxx)
    text = text.replace(/\d{6}-\d{4}/g, '');
    // Remove dates (YYYY-MM-DD, YY-MM-DD)
    text = text.replace(/\d{2,4}-\d{2}-\d{2}/g, '');
    // Remove phone numbers like +46 70 123 45 67 or 070-1234567
    text = text.replace(/\+?\d{1,3}[\s-]?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{0,3}/g, '');

    // Helper: parse a raw matched amount string into a number
    const parseAmountString = (raw: string): number | null => {
      let clean = raw.replace(/\s/g, ''); // strip all whitespace
      // Remove trailing currency markers
      clean = clean.replace(/(?:kr|sek|usd|eur|nok|dkk|gbp)$/i, '');
      if (!clean) return null;

      const lastPunctuationIndex = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
      if (lastPunctuationIndex !== -1 && clean.length - lastPunctuationIndex === 3) {
        // Standard 2-decimal format: "1234,56" or "1234.56"
        const integerPart = clean.substring(0, lastPunctuationIndex).replace(/[\.,]/g, '');
        const decimalPart = clean.substring(lastPunctuationIndex + 1);
        const val = parseFloat(`${integerPart || '0'}.${decimalPart}`);
        return isNaN(val) ? null : val;
      } else {
        // Integer amount (e.g. "Att betala 904")
        const val = parseFloat(clean.replace(/[^0-9]/g, ''));
        return isNaN(val) || val === 0 ? null : val;
      }
    };

    // Helper: extract all decimal amounts from a line
    const extractDecimalAmounts = (str: string): number[] => {
      const regex = /(?<!\d)\d{1,3}(?:[ .]?\d{3})*\s*[.,]\s*\d{2}(?!\d)/g;
      const matches = str.match(regex);
      if (!matches) return [];
      return matches.map(m => parseAmountString(m)).filter((v): v is number => v !== null);
    };

    // STEP B: Keyword-based extraction (strongest signal)
    // Ordered by specificity — longer phrases first so regex matches them preferentially.
    const keywords = [
      // Swedish multi-word (most specific)
      'summa att betala',
      'belopp att betala',
      'betalt belopp',
      'att betala',
      'totalbelopp',
      'slutbelopp',
      'fakturabelopp',
      'slutsumma',
      // Swedish single-word
      'totalt', 'summa', 'belopp', 'betalat', 'total',
      'kort', 'swish', 'brutto',
      // English multi-word
      'grand total', 'total amount', 'amount due', 'amount paid', 'balance due',
      // English single-word
      'paid', 'charge', 'sum',
    ];

    // Build one big alternation regex from the keyword list
    const keywordPattern = keywords.map(k => k.replace(/\s+/g, '\\s+')).join('|');
    // Ensure strict word boundaries to prevent matching "sum" inside "referensnummer"
    const keywordRegex = new RegExp(
      `\\b(?:${keywordPattern})\\b\\s*:?\\s*([\\d\\s.,]{1,20}\\d)`,
      'gi'
    );

    const keywordMatches = [...text.matchAll(keywordRegex)];
    const keywordAmounts: number[] = [];

    // Group expenses are extremely unlikely to exceed 100,000 SEK.
    // This safety threshold filters out long OCR reference numbers, bank accounts, or IBANs.
    const MAX_SAFETY_LIMIT = 100000;

    for (const match of keywordMatches) {
      if (match[1]) {
        const val = parseAmountString(match[1].trim());
        if (val !== null && val > 0 && val < MAX_SAFETY_LIMIT) {
          keywordAmounts.push(val);
        }
      }
    }

    console.log('[OCR] Keyword amounts:', keywordAmounts);

    if (keywordAmounts.length > 0) {
      // The highest keyword-adjacent amount is almost certainly the total
      const maxKeywordAmount = Math.max(...keywordAmounts);
      if (maxKeywordAmount > 0) return maxKeywordAmount;
    }

    // STEP C: Fallback — highest decimal amount found anywhere
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let allAmounts: number[] = [];
    for (const line of lines) {
      allAmounts.push(...extractDecimalAmounts(line));
    }
    // Apply safety filter to fallback amounts too
    allAmounts = allAmounts.filter(a => a > 0 && a < MAX_SAFETY_LIMIT);

    console.log('[OCR] All decimal amounts:', allAmounts);

    if (allAmounts.length === 0) return null;

    return Math.max(...allAmounts);
  }
};
