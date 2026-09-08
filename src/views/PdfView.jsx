import { useCallback, useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useApp } from '../state/AppContext.jsx';
import { formatBytes, formatRelative, pickFiles, clamp } from '../lib/utils.js';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import './pdf.css';

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 5;

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
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
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
  const [viewportWidth, setViewportWidth] = useState(0);

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
        const viewport = pdfPage.getViewport({ scale: effective * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

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
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => clamp(p + 1, 1, numPages));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => clamp(p - 1, 1, numPages));
      if (e.key === 'Escape' && battlemap) exitBattlemap();
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

  const zoom = (delta) => {
    setFitWidth(false);
    setScale((s) => clamp(Number((s + delta).toFixed(2)), ZOOM_MIN, ZOOM_MAX));
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
            aria-label="Page precedente"
          >
            <Icon name="chevronLeft" />
          </button>
          <input
            className="pdf__page-input"
            type="number"
            min={1}
            max={numPages || 1}
            value={page}
            onChange={(e) => setPage(clamp(Number(e.target.value) || 1, 1, numPages || 1))}
            aria-label="Numero de page"
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
          <button type="button" className="btn btn--sm btn--icon" onClick={() => zoom(-0.25)} aria-label="Dezoomer">
            <Icon name="zoomOut" />
          </button>
          <button
            type="button"
            className={`btn btn--sm${fitWidth ? ' btn--primary' : ''}`}
            onClick={() => setFitWidth((f) => !f)}
            title="Ajuster a la largeur"
          >
            {fitWidth ? 'Ajuste' : `${Math.round(scale * 100)}%`}
          </button>
          <button type="button" className="btn btn--sm btn--icon" onClick={() => zoom(0.25)} aria-label="Zoomer">
            <Icon name="zoomIn" />
          </button>

          {battlemap ? (
            <button
              type="button"
              className={`btn btn--sm btn--icon${grid.on ? ' btn--primary' : ''}`}
              onClick={() => setShowGridPanel((s) => !s)}
              aria-label="Reglages de la grille"
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
            <span className="label">Opacite : {Math.round(grid.opacity * 100)} %</span>
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
        <div className="pdf__stage" hidden={status !== 'ready'}>
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
      if (added) toast(`${added} document(s) importe(s).`, 'ok');
    } catch (err) {
      console.error(err);
      toast("L'import a echoue (fichier trop volumineux ?).", 'err');
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
            Importez vos regles, scenarios ou cartes en PDF. Ils restent stockes sur l’appareil et
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
                    {formatBytes(d.size)} · ajoute {formatRelative(d.addedAt)}
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
        message="Le fichier sera retire du stockage de l’application."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await deleteDocument(confirmId);
          toast('Document supprime.');
        }}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}
