// const { createCanvas, loadImage } = require('canvas');
// const QRCode = require('qr-image');
// const fs = require('fs');

// async function createTradeImage(tokenName: any, profit: any, qrValue: any) {
//   const width = 1200; // Increased width to accommodate the laptop shape
//   const height = 1000;
//   const canvas = createCanvas(width, height);
//   const context = canvas.getContext('2d');

//   // Gradient background from gray to white
//   const gradient = context.createLinearGradient(0, 0, 0, height);
//   gradient.addColorStop(0, '#212121');
//   gradient.addColorStop(1, '#FFFFFF');
//   context.fillStyle = gradient;
//   context.fillRect(0, 0, width, height);

//   // Bot logo (Assuming you have a logo image)
//   const logo = await loadImage('image/dribs_log.jpg'); // Replace with your logo path
//   context.drawImage(logo, 30, 20, 100, 100);

//   // Generate a striped pattern for the font texture
//   const patternCanvas = createCanvas(10, 10);
//   const patternContext = patternCanvas.getContext('2d');
//   patternContext.fillStyle = '#DDDDDD'; // Very light gray
//   patternContext.fillRect(0, 0, 10, 10);
//   patternContext.strokeStyle = '#FFFFFF';
//   patternContext.lineWidth = 2;
//   patternContext.beginPath();
//   patternContext.moveTo(0, 0);
//   patternContext.lineTo(10, 10);
//   patternContext.stroke();
//   const pattern = context.createPattern(patternCanvas, 'repeat');

//   // Dribs bot with tech font, texture, and shadow
//   context.font = 'bold 50px Consolas'; // Tech font
//   context.shadowColor = 'rgba(0, 0, 0, 0.5)';
//   context.shadowBlur = 4;
//   context.shadowOffsetX = 2;
//   context.shadowOffsetY = 2;
//   context.fillStyle = pattern;
//   context.fillText('DRIBS bot', 150, 70);

//   // Website URL with tech font, texture, and shadow
//   context.font = 'bold 40px Consolas'; // Tech font
//   context.fillText('www.dribs.io', 150, 110);

//   // Reset shadow settings
//   context.shadowColor = 'rgba(0, 0, 0, 0)';
//   context.shadowBlur = 0;
//   context.shadowOffsetX = 0;
//   context.shadowOffsetY = 0;

//   // Laptop shape
//   const laptopX = 480;
//   const laptopY = 50;
//   const laptopWidth = 670;
//   const laptopHeight = 770;
//   const screenX = laptopX + 20;
//   const screenY = laptopY + 20;
//   const screenWidth = laptopWidth - 40;
//   const screenHeight = laptopHeight - 60;

//   // Draw laptop base
//   context.fillStyle = '#333333'; // Dark gray
//   context.fillRect(laptopX, laptopY + laptopHeight, laptopWidth, 30);

//   // Draw laptop screen with rounded corners
//   context.beginPath();
//   context.moveTo(laptopX + 20, laptopY);
//   context.lineTo(laptopX + laptopWidth - 20, laptopY);
//   context.quadraticCurveTo(laptopX + laptopWidth, laptopY, laptopX + laptopWidth, laptopY + 20);
//   context.lineTo(laptopX + laptopWidth, laptopY + laptopHeight - 20);
//   context.quadraticCurveTo(laptopX + laptopWidth, laptopY + laptopHeight, laptopX + laptopWidth - 20, laptopY + laptopHeight);
//   context.lineTo(laptopX + 20, laptopY + laptopHeight);
//   context.quadraticCurveTo(laptopX, laptopY + laptopHeight, laptopX, laptopY + laptopHeight - 20);
//   context.lineTo(laptopX, laptopY + 20);
//   context.quadraticCurveTo(laptopX, laptopY, laptopX + 20, laptopY);
//   context.closePath();
//   context.fillStyle = '#666666'; // Light gray
//   context.fill();

//   // Terminal screen inside laptop
//   context.fillStyle = '#000000'; // Black background for terminal screen
//   context.fillRect(screenX, screenY, screenWidth, screenHeight);

//   // Terminal text inside laptop
//   context.fillStyle = '#FFFFFF'; // Green text
//   context.font = '25px "Courier New"'; // Larger monospaced font
//   context.fillText(`> echo "Welcome to DRIBS bot!"`, screenX + 10, screenY + 50);
//   context.fillText(`> profit --show`, screenX + 10, screenY + 100);
//   context.fillText(`Token: ${tokenName}`, screenX + 10, screenY + 150);
//   context.fillText(`Profit: ${profit}%`, screenX + 10, screenY + 200);
//   context.fillText(`> qr --generate`, screenX + 10, screenY + 250);

//   // Generate QR Code
//   const qrCode = QRCode.imageSync(qrValue, { type: 'png' });
//   const qrImg = await loadImage(qrCode);
//   context.drawImage(qrImg, 30, 700, 200, 200);

//   // Add the sentence near the QR code
//   context.fillStyle = '#000000';
//   context.font = 'bold 30px "Courier New"'; // Monospaced font
//   context.fillText('Trade with DRIBS bot & start earning \nthe $DRIBS token.', 30, 930, 500);
//   // context.fillText('the $DRIBS token.', 30, 760, 500);

//   // Get the image as a buffer
//   return canvas.toBuffer('image/png');
// }

// createTradeImage(
//   'DRIBS',
//   1000,
//   'https://dribs.io'
// ).then((buffer) => {
//   // Save the image buffer to a file
//   fs.writeFileSync('trade.png', buffer);
//   console.log('Image created successfully');
// }).catch((err) => {
//   console.error('Error creating image:', err);
// });
