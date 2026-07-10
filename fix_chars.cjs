const fs = require('fs');
const path = require('path');

function replaceMangledChar(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceMangledChar(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('â€”')) {
        const newContent = content.replace(/â€”/g, '-');
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log('Fixed', fullPath);
      }
    }
  }
}

replaceMangledChar(path.join(__dirname, 'src'));
