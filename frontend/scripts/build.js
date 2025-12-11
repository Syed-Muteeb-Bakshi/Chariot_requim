const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const outputDir = path.join(projectRoot, 'public');

const filesToCopy = [
  'index.html',
  'style.css',
  'app.js',
  'app-helpers.js'
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function cleanOutputDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  ensureDir(dirPath);
}

function copyStaticFiles() {
  filesToCopy.forEach((file) => {
    const src = path.join(projectRoot, file);
    const dest = path.join(outputDir, file);

    if (!fs.existsSync(src)) {
      console.warn(`[build] Skipping missing file: ${file}`);
      return;
    }

    fs.copyFileSync(src, dest);
    console.log(`[build] Copied ${file}`);
  });
}

function main() {
  console.log('[build] Preparing static bundle...');
  cleanOutputDir(outputDir);
  copyStaticFiles();
  console.log('[build] Bundle ready in ./public');
}

main();

