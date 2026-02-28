import fs from 'fs';
import path from 'path';

export async function extractText(filePath, mimeType, originalFilename) {
  if (mimeType === 'application/pdf' || originalFilename?.endsWith('.pdf')) {
    return extractPdf(filePath);
  } else if (mimeType === 'text/markdown' || originalFilename?.endsWith('.md')) {
    return extractMarkdown(filePath);
  } else {
    return extractText_plain(filePath);
  }
}

async function extractPdf(filePath) {
  // Dynamic import to avoid issues with pdfjs-dist initialization
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdfDoc = await loadingTask.promise;
  
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter(item => 'str' in item)
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      pages.push({ pageNumber: i, text: pageText });
    }
  }
  
  return {
    text: pages.map(p => p.text).join('\n\n'),
    pages,
    type: 'pdf',
  };
}

function extractMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Strip YAML frontmatter
  const stripped = content.replace(/^---[\s\S]*?---\n/, '');
  return { text: stripped, type: 'markdown' };
}

function extractText_plain(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return { text: content, type: 'text' };
}
