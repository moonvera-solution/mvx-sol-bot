const { createCanvas, loadImage } = require('canvas');
const QRCode = require('qr-image');
const fs = require('fs');

export async function createTradeImage(tokenName: any, contract: any,  profit: number ) {
  try{


  const width = 1300;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const profitToShow = (typeof profit === 'number' && !isNaN(profit)) ? profit.toFixed(3) : 'N/A';
  // Gradient background from gray to white
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#212121');
  gradient.addColorStop(0, '#FFFFFF');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  // Bot logo
  const logo = await loadImage('image/DRIBs_logo.png'); // Replace with your logo path
  context.drawImage(logo, 30, 20, 250, 250);

  // Generate font texture
  const patternCanvas = createCanvas(10, 10);
  const patternContext = patternCanvas.getContext('2d');
  patternContext.fillStyle = '#000000'; // Very light gray
  patternContext.fillRect(0, 0, 20, 20);
  patternContext.strokeStyle = '#000000';
  patternContext.lineWidth = 2;
  patternContext.beginPath();
  patternContext.moveTo(0, 0);
  patternContext.lineTo(10, 10);
  patternContext.stroke();
  const pattern = context.createPattern(patternCanvas, 'repeat');

  // Dribs bot with tech font, texture, and shadow
  context.font = 'bold 60px Courier New'; // Tech font
  context.shadowColor = 'rgba(0, 0, 0, 0.5)';
  context.shadowBlur = 4;
  context.shadowOffsetX = 2;
  context.shadowOffsetY = 2;
  context.fillStyle = pattern;
  context.fillText('DRIBS bot', 300, 140);

  // Website URL with tech font, texture, and shadow
  context.font = 'bold 40px Courier New'; // Tech font
  context.fillText('www.dribs.io', 300, 180);

  // Reset shadow settings
  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;

  // Laptop shape with 3D effect
  const laptopX = 300;
  const laptopY = 250;
  const laptopWidth = 950;
  const laptopHeight = 570;
  const screenX = laptopX + 20;
  const screenY = laptopY + 20;
  const screenWidth = laptopWidth - 40;
  const screenHeight = laptopHeight - 60;

  // Draw laptop base with 3D effect
  context.fillStyle = '#333333'; // Dark gray
  context.beginPath();
  context.moveTo(laptopX, laptopY + laptopHeight);
  context.lineTo(laptopX + laptopWidth, laptopY + laptopHeight);
  context.lineTo(laptopX + laptopWidth - 20, laptopY + laptopHeight + 30);
  context.lineTo(laptopX + 20, laptopY + laptopHeight + 30);
  context.closePath();
  context.fill();

  // Draw laptop screen with rounded corners and 3D effect
  context.beginPath();
  context.moveTo(laptopX + 20, laptopY);
  context.lineTo(laptopX + laptopWidth - 20, laptopY);
  context.quadraticCurveTo(laptopX + laptopWidth, laptopY, laptopX + laptopWidth, laptopY + 20);
  context.lineTo(laptopX + laptopWidth, laptopY + laptopHeight - 20);
  context.quadraticCurveTo(laptopX + laptopWidth, laptopY + laptopHeight, laptopX + laptopWidth - 20, laptopY + laptopHeight);
  context.lineTo(laptopX + 20, laptopY + laptopHeight);
  context.quadraticCurveTo(laptopX, laptopY + laptopHeight, laptopX, laptopY + laptopHeight - 20);
  context.lineTo(laptopX, laptopY + 20);
  context.quadraticCurveTo(laptopX, laptopY, laptopX + 20, laptopY);
  context.closePath();
  context.fillStyle = '#666666'; // Light gray
  context.fill();

  // Terminal screen inside laptop
  context.fillStyle = '#000000'; // Black background for terminal screen
  context.fillRect(screenX, screenY, screenWidth, screenHeight);

  // Terminal text inside laptop
  context.fillStyle = '#FFFFFF'; 
  context.font = 'bold 25px "Courier New"'; // Larger monospaced font
  context.fillText(`> echo "Welcome to DRIBS bot!"`, screenX + 10, screenY + 50);
  context.fillText(`> Token --show`, screenX + 10, screenY + 100);
  context.fillText(`> CA --show`, screenX + 10, screenY + 150);

  context.fillText(`> Profit --show`, screenX + 10, screenY + 200);
  context.fillText(`> qr --generate`, screenX + 10, screenY + 250);
  context.fillText(`-----------------------------------`, screenX + 10, screenY + 300);
  context.fillStyle = '#FFFFFF'; // White text
  context.font = 'bold 45px "Courier New"'; 
  context.fillText(`Token: ${tokenName}`, screenX + 10, screenY + 350);
  context.font = 'bold 30px "Courier New"'; // Larger font for profit
  context.fillText(`CA: ${contract}`, screenX + 10, screenY + 400);

  // Conditional color for profit
  if (profit >= 0) {
    context.fillStyle = '#00FF00'; // Green for positive profit
  } else {
    context.fillStyle = '#FF0000'; // Red for negative profit
  }
  context.font = 'bold 55px "Courier New"'; // Larger font for profit
  console.log("profit in image", profit);
  context.fillText(`Profit: ${profitToShow}%`, screenX + 10, screenY + 470);

  // Load and draw the additional image inside the laptop
  const additionalImg = await loadImage('image/DRIBs_logo.png'); // Replace with your image path
  context.drawImage(additionalImg, screenX + screenWidth - 220, screenY + 50, 200, 200); // Adjust position and size as needed
  const qrValue = 'https://dribs.io'; 
  // Generate QR Code
  const qrCode = QRCode.imageSync(qrValue, { type: 'png' });
  const qrImg = await loadImage(qrCode);
  context.drawImage(qrImg, 30, 700, 200, 200);

  // Add the sentence near the QR code with the same font as the pattern
  context.font = 'bold 60px Courier New'; // Tech font
  context.shadowColor = 'rgba(0, 0, 0, 0.5)';
  context.shadowBlur = 4;
  context.shadowOffsetX = 2;
  context.shadowOffsetY = 2;
  context.fillStyle = pattern;
  context.fillText('Trade with DRIBS bot & start earning the $DRIBS token.', 50, 930, 850);

  // Reset shadow settings to avoid affecting other elements
  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;

  // Add border around the outer image with shadow
  context.strokeStyle = '#000000'; // Black border
  context.lineWidth = 30;
  context.shadowColor = 'rgba(0, 0, 0, 0.5)'; // Shadow color
  context.shadowBlur = 20; // Shadow blur radius
  context.shadowOffsetX = 5; // Horizontal shadow offset
  context.shadowOffsetY = 5; // Vertical shadow offset
  context.strokeRect(0, 0, width, height);

  // Reset shadow settings to avoid affecting other elements
  context.shadowColor = 'rgba(0, 0, 0, 0)';
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;

  // Get the image as a buffer
  return canvas.toBuffer('image/png');
} catch (error: any) {
  console.error('Error creating PNL IMAGE:', error.message);
}
}

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
