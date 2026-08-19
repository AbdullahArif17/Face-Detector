import sharp from 'sharp';
import path from 'path';

const inputPath = 'public/images/face-attendance-logo.png';
const outputDir = 'android/app/src/main/res';

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function generateIcons() {
  try {
    for (const [folder, size] of Object.entries(sizes)) {
      const outputPath = path.join(outputDir, folder, 'ic_launcher.png');
      await sharp(inputPath)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(outputPath);
      console.log(`Generated ${outputPath} (${size}x${size})`);
    }
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();