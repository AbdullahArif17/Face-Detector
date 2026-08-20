import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Preparing for export build...");

// Backup original config and copy the export configuration
if (fs.existsSync('next.config.mjs')) {
  fs.copyFileSync('next.config.mjs', 'next.config.mjs.backup');
}
fs.copyFileSync('next.config.export.mjs', 'next.config.mjs');

const apiPath = path.join(__dirname, 'src/app/api/backend');
const backupPath = path.join(__dirname, 'src/app/api/_backend');

let apiMoved = false;

try {
  // Temporarily rename the API route to ignore it during static export
  if (fs.existsSync(apiPath)) {
    console.log(`Temporarily renaming API route to bypass Next.js export restriction...`);
    fs.renameSync(apiPath, backupPath);
    apiMoved = true;
  }

  console.log("Building Next.js frontend...");
  execSync('npm run build', { stdio: 'inherit' });

  console.log("Syncing Capacitor...");
  execSync('npx cap sync android', { stdio: 'inherit' });
  
  console.log("Building Android Release APK...");
  const androidDir = path.join(__dirname, 'android');
  
  // Cross-platform gradlew execution
  const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
  
  execSync(`${gradlewCmd} assembleRelease --no-daemon`, { 
    stdio: 'inherit',
    cwd: androidDir
  });

  console.log("✅ APK build completed successfully!");
  console.log(`The APK can be found in: android/app/build/outputs/apk/release/`);
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
} finally {
  // Restore the API route
  if (fs.existsSync(backupPath)) {
    console.log(`Restoring API route...`);
    fs.renameSync(backupPath, apiPath);
  }

  // Restore the original config
  if (fs.existsSync('next.config.mjs.backup')) {
    console.log(`Restoring next.config.mjs...`);
    fs.copyFileSync('next.config.mjs.backup', 'next.config.mjs');
    fs.unlinkSync('next.config.mjs.backup');
  }
}
