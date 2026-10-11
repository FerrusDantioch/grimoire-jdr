import { parseExpression, rollExpression, formatBreakdown, statToModifier, validateExpression } from '../src/lib/dice.js';
import { renderMarkdown, markdownToPlainText, wordCount } from '../src/lib/markdown.js';

// Fuseau a l'ouest de Greenwich, pose AVANT de charger utils.js (ses formats de
// date figent le fuseau a leur creation) : le decalage d'un jour sur les dates
// du journal ne se voit pas en UTC, fuseau des serveurs d'integration.
process.env.TZ = 'Pacific/Tahiti';
const { debounce, formatDate } = await import('../src/lib/utils.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

ok(parseExpression('2d6+3').normalized === '2d6 + 3', 'parse 2d6+3');
ok(parseExpression('d20').terms[0].count === 1, 'parse d20 -> 1 de');
ok(parseExpression('4d6kh3').terms[0].keepCount === 3, 'parse 4d6kh3');
ok(parseExpression('1d20 - 1').normalized === '1d20 - 1', 'espaces + soustraction');
ok(validateExpression('2x6') !== null, 'expression invalide rejetee');
ok(validateExpression('101d6') !== null, 'trop de des rejete');
ok(validateExpression('1d1') !== null, 'de a 1 face rejete');
ok(validateExpression('4d6kh9') !== null, 'kh > nb de des rejete');

for (let i = 0; i < 400; i++) {
  const r = rollExpression('2d6+3');
  if (r.total < 5 || r.total > 15) { ok(false, 'borne 2d6+3 violee: ' + r.total); break; }
}
ok(true, '2d6+3 reste dans [5,15] sur 400 jets');

const kept = rollExpression('4d6kh3').terms[0];
ok(kept.kept.length === 3 && kept.dropped.length === 1, '4d6kh3 garde 3 des, en jette 1');
ok(kept.value === kept.kept.reduce((a, b) => a + b, 0), 'somme = des gardes');

const withMod = rollExpression('1d20', { modifiers: [{ label: 'Force', value: 3 }], character: { id: 'c1', name: 'Aldric' } });
ok(withMod.total === withMod.diceTotal + 3, 'modificateur applique');
ok(withMod.characterName === 'Aldric', 'personnage lie au jet');
ok(/\(Force\)/.test(formatBreakdown(withMod)), 'libelle du modificateur affiche: ' + formatBreakdown(withMod));

ok(statToModifier(16, 'dnd') === 3, 'stat 16 -> +3 (d20)');
ok(statToModifier(8, 'dnd') === -1, 'stat 8 -> -1 (d20)');
ok(statToModifier(4, 'raw') === 4, 'stat brute -> 4');

let crit = 0, fumble = 0;
for (let i = 0; i < 800; i++) {
  const c = rollExpression('1d20').crit;
  if (c === 'critique') crit++;
  if (c === 'echec') fumble++;
}
ok(crit > 10 && fumble > 10, `critiques detectes (20:${crit} / 1:${fumble})`);

const html = renderMarkdown('# Titre\n\nUn **coup** et 5 pieces.\n\n- a\n- b\n\n> cite');
ok(html.includes('<h2>Titre</h2>'), 'titre markdown');
ok(html.includes('<strong>coup</strong>'), 'gras');
ok(html.includes('5 pieces'), 'nombre ordinaire intact (pas de code span fantome)');
ok(html.includes('<li>a</li>'), 'liste');
ok(html.includes('<blockquote>'), 'citation');

const xss = renderMarkdown('<img src=x onerror=alert(1)>\n\n[clic](javascript:alert(1))');
ok(!xss.includes('<img'), 'HTML brut neutralise');
ok(!xss.includes('javascript:'), 'lien javascript: neutralise');
ok(renderMarkdown('`a<b>c`').includes('<code>a&lt;b&gt;c</code>'), 'code span echappe');

ok(markdownToPlainText('# T\n\n- x').includes('- x'), 'texte brut');
ok(wordCount('un deux trois') === 3, 'compte de mots');

// Sauvegarde differee des editeurs : `flush` ne doit rien faire sans
// modification en attente (sinon un element supprime etait reenregistre).
{
  const saved = [];
  const save = debounce((v) => saved.push(v), 50);
  save.flush('rien');
  ok(saved.length === 0, 'flush sans modification en attente : aucune sauvegarde');
  save('a');
  save.flush('a');
  ok(saved.length === 1 && saved[0] === 'a', 'flush avec modification en attente : sauvegarde immediate');
  save.flush('a');
  ok(saved.length === 1, 'second flush : pas de doublon');
  save('b');
  save.cancel();
  save.flush('b');
  ok(saved.length === 1, 'flush apres cancel (suppression) : rien n’est reenregistre');
  save('c');
  await new Promise((r) => setTimeout(r, 80));
  ok(saved.length === 2 && saved[1] === 'c', 'sauvegarde differee executee apres le delai');
  save.flush('c');
  ok(saved.length === 2, 'flush apres execution du delai : pas de doublon');
}

// Une date « AAAA-MM-JJ » s'affiche au jour choisi, quel que soit le fuseau.
ok(/^11 /.test(formatDate('2026-10-11')), `date du journal au bon jour : ${formatDate('2026-10-11')}`);

console.log(fail === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fail} ECHEC(S)`);
process.exit(fail ? 1 : 0);
