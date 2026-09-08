/**
 * Rendu Markdown minimaliste et sur : le texte est echappe AVANT toute
 * transformation, donc aucun HTML de l'utilisateur n'est interprete.
 * Couvre ce qu'on ecrit reellement dans un journal de partie.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Formatage inline hors code span. Le texte recu est deja echappe. */
function formatSegment(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt) => alt) // images : texte alternatif seulement
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
      SAFE_URL.test(href)
        ? `<a href="${href.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label
    )
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/**
 * Applique le formatage inline en laissant les code spans intacts.
 * On decoupe la chaine sur les segments entre accents graves plutot que
 * d'utiliser des marqueurs temporaires, qui pourraient entrer en collision
 * avec le texte de l'utilisateur.
 */
function inline(text) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.length > 1 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${part.slice(1, -1)}</code>`
        : formatSegment(part)
    )
    .join('');
}

/**
 * Decoupe le markdown en blocs structures — sert au rendu HTML et a l'export PDF.
 * @returns {Array<{type:string, text?:string, level?:number, items?:string[], ordered?:boolean}>}
 */
export function parseBlocks(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\d+[.)]\s+/.test(lines[i]) : /^[-*+]\s+/.test(lines[i]))) {
        items.push(lines[i++].replace(ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/, ''));
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|[-*+]\s|\d+[.)]\s|```)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

/** Markdown -> HTML (chaine sure, destinee a dangerouslySetInnerHTML). */
export function renderMarkdown(md) {
  return parseBlocks(md)
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const tag = `h${Math.min(6, block.level + 1)}`;
          return `<${tag}>${inline(escapeHtml(block.text))}</${tag}>`;
        }
        case 'hr':
          return '<hr />';
        case 'code':
          return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
        case 'quote':
          return `<blockquote>${inline(escapeHtml(block.text))}</blockquote>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = block.items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join('');
          return `<${tag}>${items}</${tag}>`;
        }
        default:
          return `<p>${inline(escapeHtml(block.text)).replace(/\n/g, '<br />')}</p>`;
      }
    })
    .join('\n');
}

/** Retire les marques markdown d'une ligne (pour texte brut et PDF). */
export function stripInline(text) {
  return String(text ?? '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 ($2)')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Markdown -> texte brut lisible (export .txt). */
export function markdownToPlainText(md) {
  return parseBlocks(md)
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `${block.text}\n${'='.repeat(Math.max(3, block.text.length))}`;
        case 'hr':
          return '--------------------------------';
        case 'code':
          return block.text;
        case 'quote':
          return `« ${stripInline(block.text)} »`;
        case 'list':
          return block.items.map((it, n) => `${block.ordered ? `${n + 1}.` : '-'} ${stripInline(it)}`).join('\n');
        default:
          return stripInline(block.text);
      }
    })
    .join('\n\n');
}

/** Compte de mots, affiche sous l'editeur. */
export function wordCount(md) {
  const text = markdownToPlainText(md).trim();
  return text ? text.split(/\s+/).length : 0;
}
