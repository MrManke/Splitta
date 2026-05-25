# Ölle-Split

En modern webbapplikation för att dela upp kostnader under resor och äventyr. Skapad för att snabbt och enkelt registrera utlägg, räkna ut vem som är skyldig vem, och exportera en slutrapport med Swish-QR-koder.

## Funktioner

- **Resor & Deltagare**: Skapa resor och bjud in vänner (med e-post eller ghost-användare).
- **Smarta Utlägg**: Lägg in utgifter, dela lika eller procentuellt, och bifoga kvitton via bild/kamera.
- **Kvitto-AI (OCR)**: Scanna kvitton och låt appen automatiskt hitta totalbeloppet.
- **Swish-integration**: Skapar automatiskt Swish-QR-koder och öppnar Swish-appen med ifyllt nummer, belopp och meddelande för snabba regleringar.
- **Avancerad Export**: Generera en snygg slutrapport som **PDF** eller **Bild (JPG)**, eller dela direkt via **WhatsApp** och **E-post**.
- **Fjäll-läge (Offline)**: Använd appen offline (sparar i webbläsaren) och synka senare.
- **Teman**: Byt mellan Havsblå, Midnatt och Klassisk lila.

## Teknikstack

- **Frontend**: React, TypeScript, Vite
- **Backend & Databas**: Firebase (Firestore) & Firebase Authentication (E-post/Magic Link)
- **AI/OCR**: Google Cloud Vision API (`DOCUMENT_TEXT_DETECTION`)
- **Styling**: Vanilla CSS (med variabler och themes)
- **Ikoner**: Lucide React
- **Export**: html2canvas & jspdf
- **QR-koder**: qrcode, api.qrserver.com

## Kör lokalt

1. Klona repot
2. Installera beroenden:
   `npm install`
3. Konfigurera Firebase:
   - Skapa en `.env`-fil i rooten och lägg in dina Firebase-nycklar:
     ```
     VITE_FIREBASE_API_KEY=...
     VITE_FIREBASE_AUTH_DOMAIN=...
     VITE_FIREBASE_PROJECT_ID=...
     VITE_FIREBASE_STORAGE_BUCKET=...
     VITE_FIREBASE_MESSAGING_SENDER_ID=...
     VITE_FIREBASE_APP_ID=...
     VITE_GOOGLE_VISION_API_KEY=...
     ```
4. Starta servern:
   `npm run dev`
