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
- **Styling**: Vanilla CSS (med variabler och themes)
- **Ikoner**: Lucide React
- **Export**: html2canvas & jspdf
- **QR-koder**: qrcode, api.qrserver.com

## Kör lokalt

1. Klona repot
2. Installera beroenden:
   `npm install`
3. Starta servern:
   `npm run dev`

All data sparas lokalt i webbläsaren (localStorage) tills en extern databas kopplas på.
