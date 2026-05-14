import { applySettingsToPage, getSettings, escapeHtml } from '../app-settings.js';
import { deleteQuoteRecord, listQuotes, saveQuote } from '../quote-store.js';
import { registerPwa } from '../invoice-store.js';
import { wireJsonPasteModal } from '../json-paste-modal.js';

function fmtDate(iso) {
  if (!iso) return 'Sin fecha';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmt(n) {
  return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
}

function calcTotal(quote) {
  const subtotal = (quote.items || []).reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
  const discountAmt = quote.discount?.enabled ? (quote.discount.amount || 0) : 0;
  return subtotal - discountAmt;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getSearchHaystack(record) {
  const client = record.quote?.client || {};
  return normalize([
    record.title,
    record.documentNumber,
    record.quote?.projectName,
    client.name,
    client.nit,
    client.contact,
    client.email,
  ].join(' '));
}

function groupByClient(records) {
  const groups = new Map();
  records.forEach(record => {
    const name = record.quote?.client?.name?.trim() || 'Cliente sin nombre';
    if (!groups.has(record.clientKey)) groups.set(record.clientKey, { name, records: [] });
    groups.get(record.clientKey).records.push(record);
  });
  return Array.from(groups.values());
}

const STATUS_LABELS = {
  draft:    'Borrador',
  sent:     'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

function renderQuoteRow(record) {
  const quote = record.quote || {};
  const client = quote.client || {};
  const status = STATUS_LABELS[quote.status] || 'Borrador';
  const total = calcTotal(quote);

  return `
    <article class="invoice-row">
      <div>
        <p class="invoice-title">${escapeHtml(record.title)}</p>
        <div class="invoice-meta">
          <span>${escapeHtml(record.documentNumber)}</span>
          <span>${escapeHtml(quote.projectName || 'Sin proyecto')}</span>
          <span>${escapeHtml(status)}</span>
          <span>${fmt(total)}</span>
          <span>Actualizada ${fmtDate(record.updatedAt)}</span>
        </div>
      </div>
      <div class="invoice-actions">
        <a class="btn btn-primary btn-sm" href="/cotizacion?id=${encodeURIComponent(record.id)}">Ver</a>
        <a class="btn btn-ghost btn-sm" href="/cotizacion-editor?id=${encodeURIComponent(record.id)}">Editar</a>
        <button class="btn btn-ghost btn-sm" data-download-id="${escapeHtml(record.id)}">JSON</button>
        <button class="btn btn-ghost btn-sm danger-btn" data-delete-id="${escapeHtml(record.id)}">Eliminar</button>
      </div>
    </article>
  `;
}

function renderClientGroup(group) {
  return `
    <section class="client-group">
      <div class="client-heading">
        <div class="client-name">${escapeHtml(group.name)}</div>
        <div class="client-count">${group.records.length} cotización${group.records.length === 1 ? '' : 'es'}</div>
      </div>
      ${group.records.map(renderQuoteRow).join('')}
    </section>
  `;
}

function renderEmptyState(query) {
  return `
    <div class="empty-state">
      <strong>No hay cotizaciones para mostrar</strong>
      <p>${query ? 'Prueba con otra búsqueda.' : 'Visita <a href="/cotizacion">Cotización</a> para crear tu primera.'}</p>
    </div>
  `;
}

export function initQuotesHistoryPage() {
  let quotes = [];
  const root  = document.getElementById('quotes-history-root');
  const search = document.getElementById('quotes-search');

  function render() {
    const query = normalize(search.value);
    const filtered = query
      ? quotes.filter(r => getSearchHaystack(r).includes(query))
      : quotes;

    root.innerHTML = filtered.length
      ? groupByClient(filtered).map(renderClientGroup).join('')
      : renderEmptyState(query);
  }

  async function refresh() {
    quotes = await listQuotes();
    render();
  }

  root.addEventListener('click', async event => {
    // Delete
    const deleteBtn = event.target.closest('[data-delete-id]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-id');
      const record = quotes.find(r => r.id === id);
      if (!confirm(`¿Eliminar ${record?.documentNumber || 'esta cotización'}? Esta acción no se puede deshacer.`)) return;
      await deleteQuoteRecord(id);
      await refresh();
      return;
    }

    // Download JSON
    const downloadBtn = event.target.closest('[data-download-id]');
    if (downloadBtn) {
      const id = downloadBtn.getAttribute('data-download-id');
      const record = quotes.find(r => r.id === id);
      if (!record) return;
      const blob = new Blob([JSON.stringify(record.quote, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${record.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  search.addEventListener('input', render);

  const pasteModal = wireJsonPasteModal('json-paste-modal', async (parsed) => {
    await saveQuote(parsed);
    await refresh();
  });
  document.getElementById('btn-paste-json')?.addEventListener('click', () => pasteModal?.open());

  registerPwa();
  applySettingsToPage(getSettings());
  refresh();
}
