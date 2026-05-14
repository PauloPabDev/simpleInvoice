import { applySettingsToPage, getProviderFromSettings, getSettings } from '../app-settings.js';
import {
  getActiveQuoteRecord,
  getQuoteRecord,
  getNextDocumentNumber,
  saveQuote,
} from '../quote-store.js';
import { registerPwa } from '../invoice-store.js';

export function initQuoteEditorPage() {
  const defaultData = JSON.parse(document.getElementById('qeditor-default-data').textContent);
  let currentRecord = null;
  let isDirty = false;

  // ── Helpers ─────────────────────────────────────────────────
  function fmt(n) {
    return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
  }

  function calcTotals(quote) {
    const subtotal = (quote.items || []).reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
    const discountAmt = quote.discount?.enabled ? (quote.discount.amount || 0) : 0;
    return { subtotal, discountAmt, total: subtotal - discountAmt };
  }

  function parseLines(text) {
    return (text || '').split('\n').map(s => s.trim()).filter(Boolean);
  }

  function linesToText(arr) {
    return (arr || []).join('\n');
  }

  // ── Read form → quote object ─────────────────────────────────
  function readForm() {
    return {
      documentNumber: val('qf-doc-number'),
      status: val('qf-status'),
      issuedAt: val('qf-issued'),
      validDays: parseInt(val('qf-valid-days') || '15', 10),
      projectName: val('qf-project'),
      client: {
        name:    val('qf-client-name'),
        nit:     val('qf-client-nit'),
        contact: val('qf-client-contact'),
        email:   val('qf-client-email'),
        address: val('qf-client-address'),
        city:    val('qf-client-city'),
      },
      summary: val('qf-summary'),
      objectives: {
        problem:  val('qf-obj-problem'),
        result:   val('qf-obj-result'),
        delivery: val('qf-obj-delivery'),
      },
      scope:       parseLines(val('qf-scope')),
      items:       readItems(),
      discount: {
        enabled:     checked('qf-disc-enabled'),
        description: val('qf-disc-desc'),
        amount:      parseFloat(val('qf-disc-amount') || '0'),
      },
      phases:       readPhases(),
      deliverables: parseLines(val('qf-deliverables')),
      exclusions:   parseLines(val('qf-exclusions')),
      timingRows:   readTimingRows(),
      timingTotal:  val('qf-timing-total'),
      paymentSteps: readPaymentSteps(),
      conditions:   parseLines(val('qf-conditions')),
      notes:        val('qf-notes'),
    };
  }

  const TRASH_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

  function phaseCardHtml(phase, idx) {
    const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return `
      <div class="item-card qphase-card" data-idx="${idx}">
        <div class="item-card-top">
          <div class="field" style="flex:0 0 160px;">
            <label>Nombre de la fase</label>
            <input class="qphase-name" type="text" value="${e(phase.name || '')}" placeholder="Planeación" />
          </div>
          <div class="field" style="flex:1;">
            <label>Tiempo estimado</label>
            <input class="qphase-time mono" type="text" value="${e(phase.time || '')}" placeholder="1–2 DÍAS" />
          </div>
          <button class="remove-btn qphase-remove" title="Eliminar fase" aria-label="Eliminar fase">${TRASH_SVG}</button>
        </div>
        <div class="field">
          <label>Puntos clave <span class="field-hint">(uno por línea)</span></label>
          <textarea class="qphase-bullets" rows="3" placeholder="Recolección de info&#10;Definición del alcance">${e((phase.bullets || []).join('\n'))}</textarea>
        </div>
      </div>
    `;
  }

  function timingCardHtml(row, idx) {
    const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return `
      <div class="item-card qtiming-card" data-idx="${idx}">
        <div class="item-card-top">
          <div class="field" style="flex:1;">
            <label>Fase</label>
            <input class="qtiming-phase" type="text" value="${e(row.phase || '')}" placeholder="Planeación" />
          </div>
          <div class="field" style="flex:0 0 200px;">
            <label>Tiempo</label>
            <input class="qtiming-time mono" type="text" value="${e(row.time || '')}" placeholder="1 a 2 días" />
          </div>
          <button class="remove-btn qtiming-remove" title="Eliminar fila" aria-label="Eliminar fila">${TRASH_SVG}</button>
        </div>
      </div>
    `;
  }

  function paymentCardHtml(step, idx) {
    const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return `
      <div class="item-card qpayment-card" data-idx="${idx}">
        <div class="item-card-top">
          <div class="field" style="flex:0 0 110px;">
            <label>Porcentaje (%)</label>
            <input class="qpayment-pct mono" type="number" value="${step.percentage ?? ''}" min="0" max="100" placeholder="40" />
          </div>
          <div class="field" style="flex:0 0 180px;">
            <label>Nombre</label>
            <input class="qpayment-name" type="text" value="${e(step.name || '')}" placeholder="Para iniciar" />
          </div>
          <div class="field" style="flex:1;">
            <label>Descripción</label>
            <input class="qpayment-desc" type="text" value="${e(step.description || '')}" placeholder="Anticipo al firmar…" />
          </div>
          <button class="remove-btn qpayment-remove" title="Eliminar paso" aria-label="Eliminar paso">${TRASH_SVG}</button>
        </div>
      </div>
    `;
  }

  function readPhases() {
    return Array.from(document.querySelectorAll('.qphase-card')).map(card => ({
      name:    card.querySelector('.qphase-name').value,
      time:    card.querySelector('.qphase-time').value,
      bullets: parseLines(card.querySelector('.qphase-bullets').value),
    }));
  }

  function readTimingRows() {
    return Array.from(document.querySelectorAll('.qtiming-card')).map(card => ({
      phase: card.querySelector('.qtiming-phase').value,
      time:  card.querySelector('.qtiming-time').value,
    }));
  }

  function readPaymentSteps() {
    return Array.from(document.querySelectorAll('.qpayment-card')).map(card => ({
      percentage:  parseFloat(card.querySelector('.qpayment-pct').value || '0'),
      name:        card.querySelector('.qpayment-name').value,
      description: card.querySelector('.qpayment-desc').value,
    }));
  }

  function renderPhasesList(phases) {
    document.getElementById('qphases-list').innerHTML = phases.map((p, i) => phaseCardHtml(p, i)).join('');
  }

  function renderTimingList(rows) {
    document.getElementById('qtiming-list').innerHTML = rows.map((r, i) => timingCardHtml(r, i)).join('');
  }

  function renderPaymentList(steps) {
    document.getElementById('qpayment-list').innerHTML = steps.map((s, i) => paymentCardHtml(s, i)).join('');
  }

  function addPhase() {
    const phases = readPhases();
    phases.push({ name: '', time: '', bullets: [] });
    renderPhasesList(phases);
    markDirty();
    document.querySelectorAll('.qphase-card')[phases.length - 1]?.querySelector('.qphase-name')?.focus();
  }

  function addTimingRow() {
    const rows = readTimingRows();
    rows.push({ phase: '', time: '' });
    renderTimingList(rows);
    markDirty();
    document.querySelectorAll('.qtiming-card')[rows.length - 1]?.querySelector('.qtiming-phase')?.focus();
  }

  function addPaymentStep() {
    const steps = readPaymentSteps();
    steps.push({ percentage: 0, name: '', description: '' });
    renderPaymentList(steps);
    markDirty();
    document.querySelectorAll('.qpayment-card')[steps.length - 1]?.querySelector('.qpayment-pct')?.focus();
  }

  function readItems() {
    return Array.from(document.querySelectorAll('.qitem-card')).map(card => ({
      tag:         card.querySelector('.qitem-tag').value,
      name:        card.querySelector('.qitem-name').value,
      description: card.querySelector('.qitem-desc').value,
      quantity:    parseFloat(card.querySelector('.qitem-qty').value || '1'),
      unit:        card.querySelector('.qitem-unit').value,
      unitPrice:   parseFloat(card.querySelector('.qitem-price').value || '0'),
    }));
  }

  // ── Write quote → form ───────────────────────────────────────
  function populateForm(quote, provider) {
    set('qf-doc-number', quote.documentNumber);
    set('qf-status', quote.status, 'value');
    set('qf-issued', quote.issuedAt);
    set('qf-valid-days', String(quote.validDays ?? 15));
    set('qf-project', quote.projectName);

    // Client
    set('qf-client-name',    quote.client?.name    || '');
    set('qf-client-nit',     quote.client?.nit     || '');
    set('qf-client-contact', quote.client?.contact || '');
    set('qf-client-email',   quote.client?.email   || '');
    set('qf-client-address', quote.client?.address || '');
    set('qf-client-city',    quote.client?.city    || '');

    // Resumen / objetivos
    set('qf-summary',      quote.summary || '');
    set('qf-obj-problem',  quote.objectives?.problem  || '');
    set('qf-obj-result',   quote.objectives?.result   || '');
    set('qf-obj-delivery', quote.objectives?.delivery || '');

    // Provider (read-only display)
    set('qprov-name-disp', provider.name);
    set('qprov-cc-disp',   provider.cc);

    // Items
    renderItemsList(quote.items || []);

    // Phases / timing / payment
    renderPhasesList(quote.phases || []);
    renderTimingList(quote.timingRows || []);
    set('qf-timing-total', quote.timingTotal || '');
    renderPaymentList(quote.paymentSteps || []);

    // Discount
    const discEl = document.getElementById('qf-disc-enabled');
    discEl.checked = !!quote.discount?.enabled;
    set('qf-disc-amount', String(quote.discount?.amount || 0));
    set('qf-disc-desc',   quote.discount?.description || '');
    toggleDiscount(discEl.checked);

    // Lists as textarea
    set('qf-scope',        linesToText(quote.scope));
    set('qf-deliverables', linesToText(quote.deliverables));
    set('qf-exclusions',   linesToText(quote.exclusions));
    set('qf-conditions',   linesToText(quote.conditions));
    set('qf-notes',        quote.notes || '');

    updatePreview();
  }

  // ── Items list ───────────────────────────────────────────────
  function itemCardHtml(item, idx) {
    const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return `
      <div class="item-card qitem-card" data-idx="${idx}">
        <div class="item-card-top">
          <div class="field" style="flex:0 0 130px;">
            <label>Categoría</label>
            <input class="qitem-tag mono" type="text" value="${e(item.tag || '')}" placeholder="Desarrollo" />
          </div>
          <div class="field" style="flex:1;">
            <label>Nombre del ítem</label>
            <input class="qitem-name" type="text" value="${e(item.name || '')}" placeholder="Diseño visual" />
          </div>
          <button class="remove-btn qitem-remove" title="Eliminar ítem" aria-label="Eliminar ítem">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
        <div class="field" style="margin-bottom:10px;">
          <label>Descripción</label>
          <input class="qitem-desc" type="text" value="${e(item.description || '')}" placeholder="Breve descripción del ítem" />
        </div>
        <div class="item-values">
          <div class="field">
            <label>Cantidad</label>
            <input class="qitem-qty mono" type="number" value="${item.quantity ?? 1}" min="0" step="any" />
          </div>
          <div class="field">
            <label>Unidad</label>
            <input class="qitem-unit" type="text" value="${e(item.unit || '1')}" placeholder="hrs / proyecto" />
          </div>
          <div class="field">
            <label>Valor unitario ($)</label>
            <input class="qitem-price mono" type="number" value="${item.unitPrice ?? 0}" min="0" step="1000" />
          </div>
          <div class="field">
            <label>Total</label>
            <div class="item-total-disp qitem-total">${fmt((item.quantity ?? 0) * (item.unitPrice ?? 0))}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderItemsList(items) {
    const list = document.getElementById('qitems-list');
    list.innerHTML = items.map((it, i) => itemCardHtml(it, i)).join('');
  }

  function addItem() {
    const items = readItems();
    items.push({ tag: '', name: '', description: '', quantity: 1, unit: '1', unitPrice: 0 });
    renderItemsList(items);
    markDirty();
    updatePreview();
    // Focus the new item's name field
    const cards = document.querySelectorAll('.qitem-card');
    cards[cards.length - 1]?.querySelector('.qitem-name')?.focus();
  }

  // ── Preview ──────────────────────────────────────────────────
  function updatePreview() {
    const items = readItems();
    const discEnabled = checked('qf-disc-enabled');
    const discAmt = discEnabled ? parseFloat(val('qf-disc-amount') || '0') : 0;
    const subtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
    const total = subtotal - discAmt;

    setText('qprev-subtotal', fmt(subtotal));
    setText('qprev-total', fmt(total));
    setText('qprev-doc-num', val('qf-doc-number') || '—');

    const discRow = document.getElementById('qprev-disc-row');
    if (discRow) {
      discRow.style.display = discEnabled && discAmt > 0 ? 'flex' : 'none';
      setText('qprev-disc-label', val('qf-disc-desc') || 'Descuento');
      setText('qprev-disc-val', `− ${fmt(discAmt)}`);
    }

    // Update row totals
    document.querySelectorAll('.qitem-card').forEach(card => {
      const qty   = parseFloat(card.querySelector('.qitem-qty').value || '0');
      const price = parseFloat(card.querySelector('.qitem-price').value || '0');
      card.querySelector('.qitem-total').textContent = fmt(qty * price);
    });
  }

  function toggleDiscount(enabled) {
    const sub = document.getElementById('qdisc-sub-fields');
    if (sub) sub.classList.toggle('visible', enabled);
  }

  // ── Save ─────────────────────────────────────────────────────
  async function save() {
    const quote = readForm();
    try {
      const options = currentRecord ? { id: currentRecord.id } : {};
      currentRecord = await saveQuote(quote, options);
      markClean();
      // Update "Ver" link to point to this record
      updateViewLink();
      setBadge('guardado ✓', false);
    } catch (err) {
      if (err.code === 'DUPLICATE_DOCUMENT_NUMBER') {
        alert(`Ya existe una cotización con el número ${quote.documentNumber}.`);
      } else {
        alert('Error al guardar: ' + err.message);
      }
    }
  }

  async function newQuote() {
    if (isDirty && !confirm('¿Descartar los cambios y crear una nueva cotización?')) return;
    currentRecord = null;
    const nextNum = await getNextDocumentNumber();
    const fresh = structuredClone ? structuredClone(defaultData.quote) : JSON.parse(JSON.stringify(defaultData.quote));
    fresh.documentNumber = nextNum;
    fresh.issuedAt = '';
    populateForm(fresh, getProviderFromSettings());
    markClean();
    updateViewLink();
  }

  function reset() {
    if (!confirm('¿Reiniciar el formulario con los datos guardados?')) return;
    const base = currentRecord?.quote ?? defaultData.quote;
    populateForm(base, getProviderFromSettings());
    markClean();
  }

  // ── Dirty tracking ───────────────────────────────────────────
  function markDirty() {
    isDirty = true;
    setBadge('con cambios', true);
  }

  function markClean() {
    isDirty = false;
    setBadge('guardado', false);
  }

  function setBadge(text, dirty) {
    const badge = document.getElementById('qprev-save-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.classList.toggle('dirty', dirty);
  }

  function updateViewLink() {
    const link = document.getElementById('btn-view-quote');
    if (link && currentRecord?.id) {
      link.href = `/cotizacion?id=${encodeURIComponent(currentRecord.id)}`;
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function checked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function set(id, value, prop = 'value') {
    const el = document.getElementById(id);
    if (el) el[prop] = value ?? '';
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── Event wiring ─────────────────────────────────────────────
  function wireEvents() {
    // Save / new / reset
    document.getElementById('btn-save-quote')?.addEventListener('click', save);
    document.getElementById('btn-new-quote')?.addEventListener('click', newQuote);
    document.getElementById('btn-reset-quote')?.addEventListener('click', reset);

    // Add item
    document.getElementById('qadd-item-btn')?.addEventListener('click', () => addItem());

    // Remove item + update totals (delegated)
    document.getElementById('qitems-list')?.addEventListener('click', e => {
      const removeBtn = e.target.closest('.qitem-remove');
      if (removeBtn) {
        removeBtn.closest('.qitem-card').remove();
        markDirty();
        updatePreview();
      }
    });

    document.getElementById('qitems-list')?.addEventListener('input', () => {
      markDirty();
      updatePreview();
    });

    // Phases
    document.getElementById('qadd-phase-btn')?.addEventListener('click', addPhase);
    document.getElementById('qphases-list')?.addEventListener('click', e => {
      if (e.target.closest('.qphase-remove')) {
        e.target.closest('.qphase-card').remove();
        markDirty();
      }
    });
    document.getElementById('qphases-list')?.addEventListener('input', markDirty);

    // Timing rows
    document.getElementById('qadd-timing-btn')?.addEventListener('click', addTimingRow);
    document.getElementById('qtiming-list')?.addEventListener('click', e => {
      if (e.target.closest('.qtiming-remove')) {
        e.target.closest('.qtiming-card').remove();
        markDirty();
      }
    });
    document.getElementById('qtiming-list')?.addEventListener('input', markDirty);
    document.getElementById('qf-timing-total')?.addEventListener('input', markDirty);

    // Payment steps
    document.getElementById('qadd-payment-btn')?.addEventListener('click', addPaymentStep);
    document.getElementById('qpayment-list')?.addEventListener('click', e => {
      if (e.target.closest('.qpayment-remove')) {
        e.target.closest('.qpayment-card').remove();
        markDirty();
      }
    });
    document.getElementById('qpayment-list')?.addEventListener('input', markDirty);

    // Discount toggle
    document.getElementById('qf-disc-enabled')?.addEventListener('change', e => {
      toggleDiscount(e.target.checked);
      markDirty();
      updatePreview();
    });

    // Preview on any form input
    const formPanel = document.querySelector('.form-panel');
    formPanel?.addEventListener('input', () => {
      markDirty();
      updatePreview();
    });

    // Keyboard save
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    registerPwa();
    applySettingsToPage(getSettings());

    const provider = getProviderFromSettings();
    const params = new URLSearchParams(window.location.search);
    const id    = params.get('id');
    const isNew = params.get('new') === '1';

    if (id) {
      currentRecord = await getQuoteRecord(id);
    } else if (!isNew) {
      currentRecord = await getActiveQuoteRecord();
    }

    const quote = currentRecord?.quote ?? defaultData.quote;

    // Auto-assign document number for new quotes
    if (!quote.documentNumber) {
      quote.documentNumber = await getNextDocumentNumber();
    }

    populateForm(quote, provider);
    updateViewLink();
    wireEvents();
    markClean();
  }

  init();
}
