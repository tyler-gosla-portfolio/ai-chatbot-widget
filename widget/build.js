import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outDir = path.join(__dirname, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(__dirname, 'src/chatbot.js')],
  bundle: true,
  minify: true,
  target: 'es2020',
  format: 'iife',
  outfile: path.join(outDir, 'chatbot.js'),
  metafile: true,
  logLevel: 'info',
});

const outputBytes = result.metafile?.outputs?.[path.join(outDir, 'chatbot.js')]?.bytes || 0;
console.log(`\nWidget bundle: ${(outputBytes / 1024).toFixed(1)}KB unminified`);

// Check gzip size estimate
const content = fs.readFileSync(path.join(outDir, 'chatbot.js'));
console.log(`Estimated gzip: ~${(content.length / 3 / 1024).toFixed(1)}KB`);
