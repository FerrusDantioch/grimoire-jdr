import { useCallback, useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useApp } from '../state/AppContext.jsx';
import { formatBytes, formatRelative, pickFiles, clamp } from '../lib/utils.js';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import './pdf.css';

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 5;
// Au-dela d'environ 16 millions de pixels, Safari (iOS) et beaucoup de
// navigateurs mobiles refusent de dessiner un canvas : la page resterait
// blanche aux forts zooms. On baisse alors la finesse du rendu, pas sa taille.
const MAX_CANVAS_PIXELS = 16_000_000;

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    });
  }
  return pdfjsPromise;
}

function PdfViewer({ doc, onBack }) {
  const { updateDocument } = useApp();

  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(doc.lastPage || 1);
  const [pageInput, setPageInput] = useState(String(doc.lastPage || 1));
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  /* La saisie reste libre pendant la frappe ; le bornage n'a lieu qu'a la
     validation, sinon impossible d'effacer le chiffre pour en taper un autre. */
  const commitPageInput = useCallback(() => {
    setPageInput((raw) => {
      const target = clamp(Number(raw) || 1, 1, numPages || 1);
      setPage(target);
      return String(target);
    });
  }, [numPages]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);
  const [battlemap, setBattlemap] = useState(false);
  const [grid, setGrid] = useState({ on: true, size: 64, opacity: 0.4 });
  const [showGridPanel, setShowGridPanel] = useState(false);

  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfRef = useRef(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const stageRef = useRef(null);
  // Echelle affichee, lisible sans attendre un rendu React (gestes rapides).
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // Point du document a garder sous le doigt (ou la souris) apres un zoom.
  const anchorRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  /**
   * Memorise le point de la page situe sous (clientX, clientY) : apres le
   * prochain rendu, le defilement est ajuste pour qu'il y reste.
   */
  const anchorAt = useCallback((clientX, clientY, targetX = clientX, targetY = clientY) => {
    const el = scrollRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;
    const rect = stage.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    anchorRef.current = {
      fx: (clientX - rect.left) / rect.width,
      fy: (clientY - rect.top) / rect.height,
      x: targetX - box.left,
      y: targetY - box.top,
    };
  }, []);

  const zoomTo = useCallback((next) => {
    const value = clamp(Number(next.toFixed(2)), ZOOM_MIN, ZOOM_MAX);
    // Le point memorise ne vaut que pour CE rendu : deja au zoom maximal,
    // aucun rendu n'a lieu et il ne doit pas resservir au changement de page.
    if (anchorRef.current) anchorRef.current.scale = value;
    scaleRef.current = value;
    setFitWidth(false);
    setScale(value);
  }, []);

  /* ---------- ouverture du document ---------- */
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const buffer = await doc.blob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjs.getDocument({ data: buffer });
        const document_ = await loadingTask.promise;
        if (cancelled) {
          document_.destroy();
          return;
        }
        pdfRef.current = document_;
        setPdf(document_);
        setNumPages(document_.numPages);
        setPage((p) => clamp(p, 1, document_.numPages));
        setStatus('ready');
      } catch (err) {
        console.error('[pdf] ouverture impossible', err);
        if (!cancelled) {
          setErrorMsg(err?.message || 'Fichier illisible');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [doc.id, doc.blob]);

  /* ---------- memorise la derniere page consultee ---------- */
  useEffect(
    () => () => {
      if (pageRef.current !== doc.lastPage) {
        updateDocument({ ...doc, lastPage: pageRef.current });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.id]
  );

  /* ---------- largeur disponible ---------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(el);
    setViewportWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  /* ---------- rendu de la page ---------- */
  useEffect(() => {
    if (!pdf || !viewportWidth) return undefined;
    let cancelled = false;

    (async () => {
      try {
        renderTaskRef.current?.cancel();
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const effective = fitWidth ? (viewportWidth - 24) / base.width : scale;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        let renderScale = effective * dpr;
        const pixels = base.width * base.height * renderScale * renderScale;
        if (pixels > MAX_CANVAS_PIXELS) renderScale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        const viewport = pdfPage.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(base.width * effective)}px`;
        canvas.style.height = `${Math.floor(base.height * effective)}px`;

        // Apres un zoom, le point vise reste sous le doigt ou la souris.
        const anchor = anchorRef.current;
        anchorRef.current = null;
        const el = scrollRef.current;
        if (anchor && el && !fitWidth && anchor.scale === effective) {
          const box = el.getBoundingClientRect();
          const rect = canvas.getBoundingClientRect();
          el.scrollLeft = rect.left - box.left + el.scrollLeft + anchor.fx * rect.width - anchor.x;
          el.scrollTop = rect.top - box.top + el.scrollTop + anchor.fy * rect.height - anchor.y;
        }

        const task = pdfPage.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled && fitWidth) setScale(effective);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[pdf] rendu impossible', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale, fitWidth, viewportWidth]);

  /* ---------- plein ecran ---------- */
  const enterBattlemap = useCallback(async () => {
    setBattlemap(true);
    setFitWidth(true);
    try {
      await wrapRef.current?.requestFullscreen?.();
    } catch {
      /* le plein ecran peut etre refuse : le mode reste utilisable */
    }
  }, []);

  const exitBattlemap = useCallback(async () => {
    setBattlemap(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setBattlemap(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ---------- navigation clavier ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'Escape' && battlemap) exitBattlemap();
      // Document encore en chargement : aucune page ou aller.
      if (!numPages) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => clamp(p + 1, 1, numPages));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => clamp(p - 1, 1, numPages));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages, battlemap, exitBattlemap]);

  /* ---------- glisser pour deplacer ---------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let scrollX = 0;
    let scrollY = 0;

    const down = (e) => {
      // Au doigt, le navigateur defile tout seul (et le pincement est gere
      // plus bas) : le glisser-deplacer ne sert qu'a la souris et au stylet.
      if (e.pointerType === 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollX = el.scrollLeft;
      scrollY = el.scrollTop;
      el.classList.add('is-dragging');
    };
    const moveHandler = (e) => {
      if (!dragging) return;
      el.scrollLeft = scrollX - (e.clientX - startX);
      el.scrollTop = scrollY - (e.clientY - startY);
    };
    const up = () => {
      dragging = false;
      el.classList.remove('is-dragging');
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  /* ---------- zoom a deux doigts, et pince du pave tactile ---------- */
  useEffect(() => {
    const el = scrollRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return undefined;

    // Evenements tactiles plutot que pointeurs : quand le navigateur commence
    // a defiler, il annule les pointeurs (pointercancel), alors que les
    // evenements tactiles continuent d'arriver. Pendant le geste, la page est
    // agrandie par une simple transformation CSS (fluide) ; le vrai rendu,
    // net, a lieu une fois les doigts leves.
    let pinch = null;
    const spread = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
    const middle = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const [a, b] = e.touches;
      const rect = stage.getBoundingClientRect();
      const mid = middle(a, b);
      pinch = { dist: spread(a, b), start: mid, mid, ratio: 1 };
      stage.style.transformOrigin = `${mid.x - rect.left}px ${mid.y - rect.top}px`;
    };

    const onMove = (e) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const [a, b] = e.touches;
      const base = scaleRef.current || 1;
      pinch.ratio = clamp(spread(a, b) / pinch.dist, ZOOM_MIN / base, ZOOM_MAX / base);
      pinch.mid = middle(a, b);
      const dx = pinch.mid.x - pinch.start.x;
      const dy = pinch.mid.y - pinch.start.y;
      stage.style.transform = `translate(${dx}px, ${dy}px) scale(${pinch.ratio})`;
    };

    const onEnd = (e) => {
      if (!pinch || e.touches.length >= 2) return;
      const { ratio, start, mid } = pinch;
      pinch = null;
      stage.style.transform = '';
      if (Math.abs(ratio - 1) < 0.02) return;
      // Le point qui etait sous les doigts au debut finit sous leur position finale.
      anchorAt(start.x, start.y, mid.x, mid.y);
      zoomTo(scaleRef.current * ratio);
    };

    // Pince du pave tactile et Ctrl + molette : le navigateur les signale
    // comme une molette avec la touche Ctrl.
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // Un cran de molette (~100 px, ou 3 lignes sous Firefox) vaut environ
      // 25 % de zoom ; le pave tactile envoie une multitude de petits pas.
      const step = clamp(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY, -50, 50);
      anchorAt(e.clientX, e.clientY);
      zoomTo(scaleRef.current * Math.exp(-step * 0.006));
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [anchorAt, zoomTo]);

  /** Boutons + / - : on zoome autour du centre de la zone visible. */
  const zoom = (delta) => {
    const el = scrollRef.current;
    if (el) {
      const box = el.getBoundingClientRect();
      anchorAt(box.left + box.width / 2, box.top + box.height / 2);
    }
    zoomTo(scaleRef.current + delta);
  };

  return (
    <div className={`pdf${battlemap ? ' pdf--battlemap' : ''}`} ref={wrapRef}>
      <div className="pdf__bar">
        {battlemap ? (
          <button type="button" className="btn btn--sm btn--icon" onClick={exitBattlemap} aria-label="Quitter la battlemap">
            <Icon name="collapse" />
          </button>
        ) : (
          <button type="button" className="btn btn--ghost btn--icon" onClick={onBack} aria-label="Retour aux documents">
            <Icon name="arrowLeft" />
          </button>
        )}

        <span className="pdf__title">{doc.name}</span>
        <span className="spacer" />

        <div className="pdf__pager">
          <button
            type="button"
            className="btn btn--sm btn--icon"
            onClick={() => setPage((p) => clamp(p - 1, 1, numPages))}
            disabled={page <= 1}
            aria-label="Page précédente"
          >
            <Icon name="chevronLeft" />
          </button>
          <input
            className="pdf__page-input"
            type="number"
            min={1}
            max={numPages || 1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={commitPageInput}
            onKeyDown={(e) => e.key === 'Enter' && commitPageInput()}
            aria-label="Numéro de page"
          />
          <span className="small muted">/ {numPages || '—'}</span>
          <button
            type="button"
            className="btn btn--sm btn--icon"
            onClick={() => setPage((p) => clamp(p + 1, 1, numPages))}
            disabled={page >= numPages}
            aria-label="Page suivante"
          >
            <Icon name="chevronRight" />
          </button>
        </div>

        <div className="pdf__tools">
          <button type="button" className="btn btn--sm btn--icon" onClick={() => zoom(-0.25)} aria-label="Dézoomer">
            <Icon name="zoomOut" />
          </button>
          <button
            type="button"
            className={`btn btn--sm${fitWidth ? ' btn--primary' : ''}`}
            onClick={() => setFitWidth((f) => !f)}
            title="Ajuster à la largeur"
          >
            {fitWidth ? 'Ajusté' : `${Math.round(scale * 100)}%`}
          </button>
          <button type="button" className="btn btn--sm btn--icon" onClick={() => zoom(0.25)} aria-label="Zoomer">
            <Icon name="zoomIn" />
          </button>

          {battlemap ? (
            <button
              type="button"
              className={`btn btn--sm btn--icon${grid.on ? ' btn--primary' : ''}`}
              onClick={() => setShowGridPanel((s) => !s)}
              aria-label="Réglages de la grille"
            >
              <Icon name="grid" />
            </button>
          ) : (
            <button type="button" className="btn btn--sm" onClick={enterBattlemap} title="Mode battlemap">
              <Icon name="expand" />
              <span className="hide-xs">Battlemap</span>
            </button>
          )}
        </div>
      </div>

      {battlemap && showGridPanel && (
        <div className="pdf__grid-panel card">
          <label className="fieldrow__toggle">
            <input type="checkbox" checked={grid.on} onChange={(e) => setGrid({ ...grid, on: e.target.checked })} />
            <span>Afficher la grille</span>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="label">Taille des cases : {grid.size} px</span>
            <input
              type="range"
              min={16}
              max={200}
              step={2}
              value={grid.size}
              onChange={(e) => setGrid({ ...grid, size: Number(e.target.value) })}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="label">Opacité : {Math.round(grid.opacity * 100)} %</span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(grid.opacity * 100)}
              onChange={(e) => setGrid({ ...grid, opacity: Number(e.target.value) / 100 })}
            />
          </label>
        </div>
      )}

      <div className="pdf__scroll" ref={scrollRef}>
        {status === 'loading' && (
          <div className="pdf__state">
            <div className="spinner" />
            <p className="small muted">Ouverture du document…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="pdf__state">
            <span className="empty__icon">📄</span>
            <h3>Impossible d’ouvrir ce PDF</h3>
            <p className="small muted">{errorMsg}</p>
            <button type="button" className="btn" onClick={onBack}>
              Retour
            </button>
          </div>
        )}
        <div className="pdf__stage" ref={stageRef} hidden={status !== 'ready'}>
          <canvas ref={canvasRef} className="pdf__canvas" />
          {battlemap && grid.on && (
            <div
              className="pdf__grid"
              style={{
                '--cell': `${grid.size}px`,
                '--grid-opacity': grid.opacity,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PdfView({ openId, setOpenId }) {
  const { documents, addDocument, deleteDocument, toast } = useApp();
  const [confirmId, setConfirmId] = useState(null);
  const [importing, setImporting] = useState(false);

  const open = documents.find((d) => d.id === openId) || null;

  const importPdf = async () => {
    const files = await pickFiles({ accept: 'application/pdf,.pdf', multiple: true });
    if (!files.length) return;
    setImporting(true);
    try {
      let added = 0;
      for (const file of files) {
        if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
          toast(`« ${file.name} » n’est pas un PDF.`, 'err');
          continue;
        }
        await addDocument(file);
        added++;
      }
      if (added) toast(`${added} document(s) importé(s).`, 'ok');
    } catch (err) {
      console.error(err);
      toast("L'import a échoué (fichier trop volumineux ?).", 'err');
    } finally {
      setImporting(false);
    }
  };

  if (open) return <PdfViewer doc={open} onBack={() => setOpenId(null)} />;

  return (
    <>
      <div className="page-head">
        <h2>Documents</h2>
        <span className="spacer" />
        <button type="button" className="btn btn--primary btn--sm" onClick={importPdf} disabled={importing}>
          <Icon name="upload" />
          {importing ? 'Import…' : 'Importer'}
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🗺️</span>
          <h3>Aucun document</h3>
          <p className="small">
            Importez vos règles, scénarios ou cartes en PDF. Ils restent stockés sur l’appareil et
            fonctionnent hors ligne.
          </p>
          <button type="button" className="btn btn--primary" onClick={importPdf} style={{ marginTop: 12 }}>
            <Icon name="upload" />
            Importer un PDF
          </button>
        </div>
      ) : (
        <div className="doc-grid">
          {documents.map((d) => (
            <div key={d.id} className="doc-card">
              <button type="button" className="doc-card__open" onClick={() => setOpenId(d.id)}>
                <span className="doc-card__thumb" aria-hidden="true">
                  <Icon name="file" size={26} />
                </span>
                <span className="doc-card__body">
                  <strong>{d.name}</strong>
                  <span className="small muted">
                    {formatBytes(d.size)} · ajouté {formatRelative(d.addedAt)}
                    {d.lastPage > 1 ? ` · page ${d.lastPage}` : ''}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                onClick={() => setConfirmId(d.id)}
                aria-label={`Supprimer ${d.name}`}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Supprimer ce document ?"
        message="Le fichier sera retiré du stockage de l’application."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await deleteDocument(confirmId);
          toast('Document supprimé.');
        }}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}
