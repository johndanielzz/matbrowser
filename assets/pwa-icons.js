// PWA icon generator - creates PNG icons from SVG at runtime
// This ensures the app is installable without needing pre-built PNG files
(function() {
  const sizes = [192, 512];
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#101828"/>
        <stop offset="100%" style="stop-color:#1a2a4a"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="20" fill="url(#bg)"/>
    <text x="50" y="38" text-anchor="middle" fill="#fff" font-size="22" font-weight="bold" font-family="Arial">MAT</text>
    <text x="50" y="62" text-anchor="middle" fill="#4f9cf7" font-size="16" font-weight="bold" font-family="Arial">LEADS</text>
    <text x="50" y="82" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold" font-family="Arial">AI PRO X</text>
  </svg>`;

  function generatePngIcon(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    return new Promise((resolve) => {
      img.onload = function() {
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      };
      img.src = url;
    });
  }

  // Store generated icons for manifest
  window.__pwaIcons = {};
  
  Promise.all(sizes.map(async (size) => {
    const blob = await generatePngIcon(size);
    window.__pwaIcons[size] = blob;
  }));
})();