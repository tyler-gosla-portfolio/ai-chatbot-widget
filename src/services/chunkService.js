// Approximate token count: 1 token ≈ 4 chars
const CHARS_PER_TOKEN = 4;
const CHUNK_SIZE_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const CHUNK_SIZE_CHARS = CHUNK_SIZE_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export function chunkDocument(extracted, metadata = {}) {
  const { type } = extracted;
  
  if (type === 'pdf' && extracted.pages) {
    return chunkPdf(extracted.pages, metadata);
  } else if (type === 'markdown') {
    return chunkMarkdown(extracted.text, metadata);
  } else {
    return chunkText(extracted.text, metadata);
  }
}

function chunkPdf(pages, metadata) {
  const chunks = [];
  let chunkIndex = 0;
  
  for (const { pageNumber, text } of pages) {
    const pageChunks = splitText(text, CHUNK_SIZE_CHARS, OVERLAP_CHARS);
    for (const content of pageChunks) {
      if (content.trim().length < 50) continue;
      chunks.push({
        content: content.trim(),
        chunk_index: chunkIndex++,
        metadata: JSON.stringify({ ...metadata, page_number: pageNumber, source_file: metadata.filename }),
        token_count: Math.ceil(content.length / CHARS_PER_TOKEN),
      });
    }
  }
  return chunks;
}

function chunkMarkdown(text, metadata) {
  // Split at heading boundaries first
  const sections = text.split(/(?=^#{1,3} )/m).filter(s => s.trim());
  const chunks = [];
  let chunkIndex = 0;
  
  for (const section of sections) {
    const sectionTitle = section.match(/^#{1,3} (.+)/m)?.[1] || '';
    const subChunks = splitText(section, CHUNK_SIZE_CHARS, OVERLAP_CHARS);
    for (const content of subChunks) {
      if (content.trim().length < 50) continue;
      chunks.push({
        content: content.trim(),
        chunk_index: chunkIndex++,
        metadata: JSON.stringify({ ...metadata, section_title: sectionTitle, source_file: metadata.filename }),
        token_count: Math.ceil(content.length / CHARS_PER_TOKEN),
      });
    }
  }
  return chunks;
}

function chunkText(text, metadata) {
  const parts = splitText(text, CHUNK_SIZE_CHARS, OVERLAP_CHARS);
  return parts
    .filter(p => p.trim().length >= 50)
    .map((content, i) => ({
      content: content.trim(),
      chunk_index: i,
      metadata: JSON.stringify({ ...metadata, source_file: metadata.filename }),
      token_count: Math.ceil(content.length / CHARS_PER_TOKEN),
    }));
}

// Recursive character splitting with fallback separators
function splitText(text, chunkSize, overlap) {
  if (text.length <= chunkSize) return [text];
  
  const separators = ['\n\n', '\n', '. ', ' ', ''];
  
  for (const sep of separators) {
    if (sep === '') {
      // Hard split
      const chunks = [];
      let start = 0;
      while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
      }
      return chunks;
    }
    
    const idx = text.lastIndexOf(sep, chunkSize);
    if (idx > chunkSize * 0.3) {
      const first = text.slice(0, idx + sep.length);
      const rest = text.slice(idx + sep.length - overlap);
      return [first, ...splitText(rest, chunkSize, overlap)];
    }
  }
  
  return [text];
}
