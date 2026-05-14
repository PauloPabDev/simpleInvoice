import {
  applySettingsToPage,
  getProviderFromSettings,
  getSettings,
  escapeHtml,
} from '../app-settings.js';
import {
  getActiveQuoteRecord,
  getQuoteRecord,
  saveQuote,
} from '../quote-store.js';
import { registerPwa } from '../invoice-store.js';
import { wireJsonPasteModal } from '../json-paste-modal.js';

export function initQuotePage() {
  let state = JSON.parse(document.getElementById('default-data').textContent);
  let currentRecord = null;

  // ── Helpers ────────────────────────────────────────────────
  function fmt(n) {
    return '$ ' + Math.round(n).toLocaleString('es-CO');
  }

  function fmtDate(iso) {
    if (!iso) return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function addDays(iso, days) {
    const d = iso ? new Date(iso + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function calcTotals(quote) {
    const subtotal = quote.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const discountAmt = quote.discount?.enabled ? (quote.discount.amount || 0) : 0;
    const total = subtotal - discountAmt;
    return { subtotal, discountAmt, total };
  }

  const STATUS_MAP = {
    draft:    { label: 'Borrador',  cls: 'badge-quote-draft' },
    sent:     { label: 'Enviada',   cls: 'badge-quote-sent' },
    approved: { label: 'Aprobada', cls: 'badge-quote-approved' },
    rejected: { label: 'Rechazada', cls: 'badge-quote-rejected' },
  };

  const ICON_CHECK = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const ICON_X = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  // ── Partial renderers ───────────────────────────────────────
  function renderCheckList(items, iconClass) {
    return items.map(item => `
      <div class="q-check-item">
        <span class="q-check-icon ${iconClass}">${iconClass === 'q-check-icon--no' ? ICON_X : ICON_CHECK}</span>
        ${escapeHtml(item)}
      </div>
    `).join('');
  }

  function renderPhases(phases) {
    return phases.map((phase, i) => `
      <div class="q-phase">
        <div class="q-phase-circle">${String(i + 1).padStart(2, '0')}</div>
        <div>
          <p class="q-phase-name">${escapeHtml(phase.name)}</p>
          <p class="q-phase-time">${escapeHtml(phase.time)}</p>
        </div>
        <ul class="q-phase-bullets">
          ${phase.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  function renderTimingRows(rows) {
    return rows.map(row => `
      <tr>
        <td>${escapeHtml(row.phase)}</td>
        <td class="q-mono">${escapeHtml(row.time)}</td>
      </tr>
    `).join('');
  }

  function renderPaymentSteps(steps) {
    return steps.map((step, i) => `
      <div class="q-payment-step">
        <span class="q-payment-step-tag">0${i + 1}</span>
        <p class="q-payment-step-pct">${escapeHtml(String(step.percentage))}%</p>
        <p class="q-payment-step-name">${escapeHtml(step.name)}</p>
        <p class="q-payment-step-desc">${escapeHtml(step.description)}</p>
      </div>
    `).join('');
  }

  // ── Main render ─────────────────────────────────────────────
  function render() {
    const quote = state.quote;
    const prov = state.provider;
    const { subtotal, discountAmt, total } = calcTotals(quote);

    applySettingsToPage(getSettings());

    // Header
    set('q-doc-number', quote.documentNumber);
    set('q-footer-code', quote.documentNumber);
    set('q-title', null, `Cotización<br>de proyecto`);
    set('q-subtitle', quote.projectName);

    const status = STATUS_MAP[quote.status] ?? STATUS_MAP.draft;
    const statusEl = document.getElementById('q-status');
    if (statusEl) {
      statusEl.textContent = status.label;
      statusEl.className = `badge badge-dot ${status.cls}`;
    }

    // Cover meta
    set('q-cover-client', quote.client.name);
    set('q-cover-project', quote.projectName);
    set('q-cover-issued', fmtDate(quote.issuedAt));
    set('q-cover-valid', addDays(quote.issuedAt, quote.validDays || 15));

    // Parties – provider
    set('q-prov-name', prov.name);
    set('q-prov-role', null, `&gt; ${escapeHtml(prov.title)}`);
    set('q-prov-detail', null,
      `NIT / CC: <span class="mono-val">${escapeHtml(prov.cc)}</span><br>` +
      (prov.rut ? `RUT: <span class="mono-val">${escapeHtml(prov.rut)}</span><br>` : '') +
      `<a href="mailto:${escapeHtml(prov.email)}">${escapeHtml(prov.email)}</a><br>` +
      `<span class="mono-val">${escapeHtml(prov.phone)}</span><br>${escapeHtml(prov.city)}`
    );

    // Parties – client
    set('q-client-name', quote.client.name);
    set('q-client-contact', null, `&gt; Contacto: ${escapeHtml(quote.client.contact)}`);
    set('q-client-detail', null,
      `NIT: <span class="mono-val">${escapeHtml(quote.client.nit)}</span><br>` +
      `<a href="mailto:${escapeHtml(quote.client.email)}">${escapeHtml(quote.client.email)}</a><br>` +
      `${escapeHtml(quote.client.address)}<br>${escapeHtml(quote.client.city)}`
    );

    // Summary
    set('q-summary-text', quote.summary);

    // Objectives
    set('q-obj-problem', quote.objectives?.problem || '');
    set('q-obj-result',  quote.objectives?.result  || '');
    set('q-obj-delivery', quote.objectives?.delivery || '');

    // Scope
    setHtml('q-scope-list', renderCheckList(quote.scope || [], ''));

    // Items
    setHtml('q-items-body', (quote.items || []).map(item => `
      <tr>
        <td data-label="Ítem · descripción">
          <span class="q-item-tag">${escapeHtml(item.tag)}</span>
          <p class="item-name">${escapeHtml(item.name)}</p>
          ${item.description ? `<p class="item-desc">${escapeHtml(item.description)}</p>` : ''}
        </td>
        <td data-label="Cant.">${escapeHtml(String(item.quantity))}</td>
        <td data-label="Valor unit.">${fmt(item.unitPrice)}</td>
        <td data-label="Total">${fmt(item.quantity * item.unitPrice)}</td>
      </tr>
    `).join(''));

    // Totals
    set('q-tot-subtotal', fmt(subtotal));
    set('q-tot-total', fmt(total));

    const discRow = document.getElementById('q-discount-row');
    if (discRow) {
      if (quote.discount?.enabled && discountAmt > 0) {
        discRow.style.display = '';
        set('q-disc-label', quote.discount.description || 'Descuento');
        set('q-tot-discount', `− ${fmt(discountAmt)}`);
      } else {
        discRow.style.display = 'none';
      }
    }

    // Phases
    setHtml('q-phases-list', renderPhases(quote.phases || []));

    // Deliverables
    setHtml('q-deliverables-list', renderCheckList(quote.deliverables || [], ''));

    // Exclusions
    setHtml('q-exclusions-list', renderCheckList(quote.exclusions || [], 'q-check-icon--no'));

    // Timing
    setHtml('q-timing-body', renderTimingRows(quote.timingRows || []));
    set('q-timing-total', quote.timingTotal || '—');

    // Payment steps
    setHtml('q-payment-steps', renderPaymentSteps(quote.paymentSteps || []));

    // Payment bank
    set('q-pay-bank', prov.bank);
    set('q-pay-type', prov.accountType);
    set('q-pay-number', prov.accountNumber);
    set('q-pay-holder', prov.accountHolder);
    set('q-pay-cc', prov.cc);
    set('q-pay-nequi', prov.nequi);

    // Conditions
    setHtml('q-conditions-list', (quote.conditions || []).map(c => `<li>${c}</li>`).join(''));

    // Signatures
    set('q-sign-name', prov.name);
    set('q-sign-date', fmtDate(quote.issuedAt));

    // Footer
    set('q-footer-contact', `${prov.website} · ${prov.email} · ${prov.phone}`);

    // Edit link → editor with the same record ID
    const editLink = document.getElementById('btn-edit-quote');
    if (editLink && currentRecord?.id) {
      editLink.href = `/cotizacion-editor?id=${encodeURIComponent(currentRecord.id)}`;
    }
  }

  // ── DOM helpers ─────────────────────────────────────────────
  function set(id, text, html) {
    const el = document.getElementById(id);
    if (!el) return;
    if (html !== undefined) { el.innerHTML = html; }
    else { el.textContent = text; }
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  // ── JSON upload ─────────────────────────────────────────────
  document.getElementById('quote-json-upload')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(ev) {
      try {
        const parsed = JSON.parse(ev.target.result);
        currentRecord = await saveQuote(parsed);
        state.quote = currentRecord.quote;
        render();
      } catch {
        alert('El archivo JSON no es válido o el número de cotización ya existe.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ── JSON download ───────────────────────────────────────────
  document.getElementById('btn-download-json')?.addEventListener('click', () => {
    const quote = state.quote;
    const blob = new Blob([JSON.stringify(quote, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cotizacion-${currentRecord?.id || quote.documentNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── JSON paste modal ────────────────────────────────────────
  const pasteModal = wireJsonPasteModal('json-paste-modal', async (parsed) => {
    currentRecord = await saveQuote(parsed);
    state.quote = currentRecord.quote;
    render();
  });
  document.getElementById('btn-paste-json')?.addEventListener('click', () => pasteModal?.open());

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    registerPwa();
    state.provider = getProviderFromSettings();

    const id = new URLSearchParams(window.location.search).get('id');
    currentRecord = id ? await getQuoteRecord(id) : await getActiveQuoteRecord();

    if (currentRecord) {
      state.quote = currentRecord.quote;
    }

    render();
  }

  init();
}

