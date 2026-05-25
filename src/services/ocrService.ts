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
   * Render the first page of a PDF to a PNG File using the browser's built-in PDF renderer.
   * Uses dynamic import of pdfjs-dist.
   */
  async pdfToImageFile(pdfFile: File): Promise<File | null> {
    try {
      // Dynamically load pdfjs-dist so it doesn't bloat the main bundle
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);

      const scale = 2.0; // High-res for better OCR
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx as any, canvas, viewport } as any).promise;

      // Convert canvas to blob/File
      return new Promise<File | null>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], 'pdf-page.png', { type: 'image/png' }));
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

    // Helper to extract all valid currency amounts from a string
    const extractAmounts = (str: string): number[] => {
      // Matches 123.45, 123,45, 123.00, etc.
      const regex = /\b\d+[\.,]\d{2}\b/g;
      const matches = str.match(regex);
      if (!matches) return [];
      return matches.map(m => parseFloat(m.replace(',', '.')));
    };

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // STEP B: Collect ALL valid amounts from the entire receipt
    let allAmounts: number[] = [];
    lines.forEach(line => {
      // Exclude strings that look like typical phone numbers or weights if needed, but the regex already forces .XX
      allAmounts.push(...extractAmounts(line));
    });

    allAmounts = allAmounts.filter(a => a > 0);

    if (allAmounts.length === 0) {
      return null;
    }

    // STEP C: Highest Amount Principle
    // On a receipt, the total is almost universally the highest currency amount with 2 decimals.
    // By simply taking the max of all found amounts, we avoid issues where OCR misreads keywords 
    // or grabs "Moms 6.74" instead of "Brutto 119.00".
    return Math.max(...allAmounts);
  }
};
