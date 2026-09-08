import { downloadBlob, downloadText, formatDate, formatDateTime, safeFilename } from './utils.js';
import { parseBlocks, markdownToPlainText, stripInline } from './markdown.js';

/* =========================================================
   Mise en page PDF partagee
   ========================================================= */

const PAGE = { width: 595.28, height: 841.89 }; // A4 en points
const M = { top: 56, bottom: 52, left: 48, right: 48 };
const CONTENT_W = PAGE.width - M.left - M.right;

const INK = [38, 32, 46];
const INK_SOFT = [110, 100, 124];
const RULE = [206, 196, 216];
const GOLD = [154, 107, 31];
const PANEL = [247, 244, 249];

async function createDoc(title) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({ title, creator: 'Grimoire — Compagnon JDR' });
  return doc;
}

/** Curseur de mise en page : gere le saut de page automatique. */
function layout(doc) {
  const state = { y: M.top };

  const ensure = (height) => {
    if (state.y + height > PAGE.height - M.bottom) {
      doc.addPage();
      state.y = M.top;
      return true;
    }
    return false;
  };

  return {
    get y() {
      return state.y;
    },
    set y(value) {
      state.y = value;
    },
    ensure,
    gap(h) {
      state.y += h;
    },
  };
}

function drawFooter(doc, subtitle) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK_SOFT);
    doc.text(subtitle, M.left, PAGE.height - 28);
    doc.text(`${i} / ${pages}`, PAGE.width - M.right, PAGE.height - 28, { align: 'right' });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(M.left, PAGE.height - 40, PAGE.width - M.right, PAGE.height - 40);
  }
}

function drawTitle(doc, cur, title, subtitle) {
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(title || 'Sans titre', CONTENT_W);
  cur.ensure(lines.length * 30 + 30);
  doc.text(lines, M.left, cur.y + 18);
  cur.gap(lines.length * 30);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK_SOFT);
    doc.text(subtitle, M.left, cur.y + 8);
    cur.gap(16);
  }

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.6);
  doc.line(M.left, cur.y + 10, M.left + 64, cur.y + 10);
  cur.gap(26);
}

function drawSectionHeading(doc, cur, text) {
  cur.ensure(46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text(String(text || '').toUpperCase(), M.left, cur.y + 10);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.7);
  doc.line(M.left, cur.y + 18, PAGE.width - M.right, cur.y + 18);
  cur.gap(32);
}

/* =========================================================
   Fiche de personnage
   ========================================================= */

function fieldValueText(field) {
  if (field.type === 'checkbox') return field.value ? 'Oui' : 'Non';
  const value = field.value;
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/** Dessine un encadre libelle/valeur et renvoie sa hauteur. */
function measureBox(doc, field, width) {
  const value = fieldValueText(field);
  doc.setFontSize(field.type === 'longtext' ? 10 : 12);
  const lines = doc.splitTextToSize(value, width - 20);
  return { lines, height: Math.max(44, 26 + lines.length * (field.type === 'longtext' ? 13 : 15)) };
}

function drawBox(doc, x, y, width, field, measured) {
  doc.setFillColor(...PANEL);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, width, measured.height, 5, 5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...INK_SOFT);
  doc.text(String(field.label || 'Sans nom').toUpperCase().slice(0, 46), x + 10, y + 15);

  doc.setFont('helvetica', field.type === 'longtext' ? 'normal' : 'bold');
  doc.setFontSize(field.type === 'longtext' ? 10 : 12);
  doc.setTextColor(...INK);
  doc.text(measured.lines, x + 10, y + 30);
}

export async function characterToPDF(character) {
  const doc = await createDoc(`Fiche — ${character.name || 'Personnage'}`);
  const cur = layout(doc);

  drawTitle(
    doc,
    cur,
    character.name || 'Personnage sans nom',
    [character.system, character.role].filter(Boolean).join(' · ') || null
  );

  for (const section of character.sections || []) {
    const fields = section.fields || [];
    if (!fields.length && !section.name) continue;

    drawSectionHeading(doc, cur, section.name || 'Section');

    const gap = 14;
    const half = (CONTENT_W - gap) / 2;
    let pending = null; // champ en attente pour completer une rangee de deux

    const flush = () => {
      if (!pending) return;
      const measured = measureBox(doc, pending, half);
      cur.ensure(measured.height + 10);
      drawBox(doc, M.left, cur.y, half, pending, measured);
      cur.gap(measured.height + 10);
      pending = null;
    };

    for (const field of fields) {
      if (field.type === 'longtext') {
        flush();
        const measured = measureBox(doc, field, CONTENT_W);
        cur.ensure(measured.height + 10);
        drawBox(doc, M.left, cur.y, CONTENT_W, field, measured);
        cur.gap(measured.height + 10);
        continue;
      }
      if (!pending) {
        pending = field;
        continue;
      }
      const a = measureBox(doc, pending, half);
      const b = measureBox(doc, field, half);
      const height = Math.max(a.height, b.height);
      cur.ensure(height + 10);
      drawBox(doc, M.left, cur.y, half, pending, { ...a, height });
      drawBox(doc, M.left + half + gap, cur.y, half, field, { ...b, height });
      cur.gap(height + 10);
      pending = null;
    }
    flush();
    cur.gap(8);
  }

  if (character.notes?.trim()) {
    drawSectionHeading(doc, cur, 'Notes');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    for (const line of doc.splitTextToSize(markdownToPlainText(character.notes), CONTENT_W)) {
      cur.ensure(16);
      doc.text(line, M.left, cur.y);
      cur.gap(14);
    }
  }

  drawFooter(doc, `Fiche de personnage · exportee le ${formatDate(Date.now())}`);
  return doc;
}

export function characterToText(character) {
  const out = [];
  const rule = (c = '=') => c.repeat(56);

  out.push(rule(), (character.name || 'Personnage sans nom').toUpperCase(), rule());
  if (character.system) out.push(`Systeme : ${character.system}`);
  if (character.role) out.push(`Role : ${character.role}`);
  out.push(`Exporte le ${formatDateTime(Date.now())}`, '');

  for (const section of character.sections || []) {
    out.push(`## ${section.name || 'Section'}`, rule('-'));
    for (const field of section.fields || []) {
      const value = fieldValueText(field);
      if (field.type === 'longtext') {
        out.push(`${field.label} :`, ...String(value).split('\n').map((l) => `    ${l}`));
      } else {
        out.push(`${String(field.label || '').padEnd(24, '.')} ${value}`);
      }
    }
    out.push('');
  }

  if (character.notes?.trim()) {
    out.push('## Notes', rule('-'), markdownToPlainText(character.notes), '');
  }
  return out.join('\n');
}

/* =========================================================
   Journal d'aventure
   ========================================================= */

function drawMarkdown(doc, cur, markdown) {
  for (const block of parseBlocks(markdown)) {
    switch (block.type) {
      case 'heading': {
        cur.gap(8);
        const size = [16, 14, 12.5, 11.5][Math.min(3, block.level - 1)];
        doc.setFont('times', 'bold');
        doc.setFontSize(size);
        doc.setTextColor(...INK);
        for (const line of doc.splitTextToSize(stripInline(block.text), CONTENT_W)) {
          cur.ensure(size + 10);
          doc.text(line, M.left, cur.y);
          cur.gap(size + 6);
        }
        cur.gap(4);
        break;
      }
      case 'hr':
        cur.ensure(20);
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.6);
        doc.line(M.left, cur.y, PAGE.width - M.right, cur.y);
        cur.gap(16);
        break;
      case 'quote': {
        doc.setFont('times', 'italic');
        doc.setFontSize(11);
        doc.setTextColor(...INK_SOFT);
        const lines = doc.splitTextToSize(stripInline(block.text), CONTENT_W - 22);
        for (const line of lines) {
          cur.ensure(18);
          doc.setDrawColor(...GOLD);
          doc.setLineWidth(2);
          doc.line(M.left + 2, cur.y - 9, M.left + 2, cur.y + 4);
          doc.text(line, M.left + 16, cur.y);
          cur.gap(15);
        }
        cur.gap(6);
        break;
      }
      case 'code': {
        doc.setFont('courier', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        for (const line of doc.splitTextToSize(block.text, CONTENT_W - 16)) {
          cur.ensure(15);
          doc.text(line, M.left + 8, cur.y);
          cur.gap(12);
        }
        cur.gap(6);
        break;
      }
      case 'list': {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        block.items.forEach((item, n) => {
          const bullet = block.ordered ? `${n + 1}.` : '•';
          const lines = doc.splitTextToSize(stripInline(item), CONTENT_W - 22);
          lines.forEach((line, li) => {
            cur.ensure(16);
            if (li === 0) doc.text(bullet, M.left + 4, cur.y);
            doc.text(line, M.left + 22, cur.y);
            cur.gap(14);
          });
        });
        cur.gap(6);
        break;
      }
      default: {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        for (const line of doc.splitTextToSize(stripInline(block.text), CONTENT_W)) {
          cur.ensure(16);
          doc.text(line, M.left, cur.y);
          cur.gap(14);
        }
        cur.gap(8);
      }
    }
  }
}

/**
 * @param {Array} entries  une ou plusieurs entrees de journal
 * @param {object} options { title, characterNames: Map<id,name> }
 */
export async function journalToPDF(entries, { title = "Journal d'aventure", characterNames = {} } = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  const doc = await createDoc(title);
  const cur = layout(doc);

  const single = list.length === 1;
  drawTitle(
    doc,
    cur,
    single ? list[0].title || 'Sans titre' : title,
    single
      ? [list[0].chapter, list[0].date ? formatDate(list[0].date) : null].filter(Boolean).join(' · ') || null
      : `${list.length} entrees`
  );

  list.forEach((entry, index) => {
    if (!single) {
      if (index > 0) {
        doc.addPage();
        cur.y = M.top;
      }
      doc.setFont('times', 'bold');
      doc.setFontSize(17);
      doc.setTextColor(...INK);
      for (const line of doc.splitTextToSize(entry.title || 'Sans titre', CONTENT_W)) {
        cur.ensure(24);
        doc.text(line, M.left, cur.y);
        cur.gap(21);
      }
      const meta = [entry.chapter, entry.date ? formatDate(entry.date) : null].filter(Boolean).join(' · ');
      if (meta) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...INK_SOFT);
        doc.text(meta, M.left, cur.y);
        cur.gap(16);
      }
    }

    const linked = (entry.characterIds || []).map((id) => characterNames[id]).filter(Boolean);
    if (linked.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(...INK_SOFT);
      cur.ensure(18);
      doc.text(`Personnages : ${linked.join(', ')}`, M.left, cur.y);
      cur.gap(20);
    }

    drawMarkdown(doc, cur, entry.content || '');
  });

  drawFooter(doc, `Journal d'aventure · exporte le ${formatDate(Date.now())}`);
  return doc;
}

export function journalToText(entries, { characterNames = {} } = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  const out = [];
  list.forEach((entry, i) => {
    if (i > 0) out.push('', '='.repeat(56), '');
    out.push((entry.title || 'Sans titre').toUpperCase());
    const meta = [entry.chapter, entry.date ? formatDate(entry.date) : null].filter(Boolean).join(' · ');
    if (meta) out.push(meta);
    const linked = (entry.characterIds || []).map((id) => characterNames[id]).filter(Boolean);
    if (linked.length) out.push(`Personnages : ${linked.join(', ')}`);
    out.push('-'.repeat(56), '', markdownToPlainText(entry.content || ''));
  });
  return out.join('\n');
}

/* =========================================================
   Points d'entree utilises par l'interface
   ========================================================= */

export async function exportCharacter(character, format) {
  const base = safeFilename(character.name, 'personnage');
  if (format === 'pdf') {
    const doc = await characterToPDF(character);
    downloadBlob(doc.output('blob'), `${base}.pdf`);
  } else {
    downloadText(characterToText(character), `${base}.txt`);
  }
}

export async function exportJournal(entries, format, options = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  const base = list.length === 1 ? safeFilename(list[0].title, 'journal') : 'journal-aventure';
  if (format === 'pdf') {
    const doc = await journalToPDF(list, options);
    downloadBlob(doc.output('blob'), `${base}.pdf`);
  } else {
    downloadText(journalToText(list, options), `${base}.txt`);
  }
}
