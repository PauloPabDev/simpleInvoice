import {
  applySettingsToPage,
  getSettings,
  escapeHtml,
} from '../app-settings.js';
import {
  listEmails,
  deleteEmail,
  setActiveEmailId,
  saveEmail,
} from '../email-store.js';
import { wireJsonPasteModal } from '../json-paste-modal.js';

export function initEmailsPage() {
  const templates = JSON.parse(document.getElementById('emails-templates').textContent);

  const settings = getSettings();
  applySettingsToPage(settings);

  // ── Template icons map ───────────────────────────────────────
  const iconMap = {};
  templates.forEach(t => { iconMap[t.templateId] = t.icon || '✉️'; });

  const templateNameMap = {};
  templates.forEach(t => { templateNameMap[t.templateId] = t.name || t.templateId; });

  // ── Render template gallery ──────────────────────────────────
  const galleryEl = document.getElementById('emails-gallery');
  if (galleryEl) {
    galleryEl.innerHTML = templates.map(tpl => `
      <a class="email-tpl-card" href="/correo-editor?new=1&template=${encodeURIComponent(tpl.templateId)}">
        <span class="email-tpl-icon">${tpl.icon}</span>
        <div class="email-tpl-info">
          <p class="email-tpl-name">${escapeHtml(tpl.name)}</p>
          <p class="email-tpl-desc">${escapeHtml(tpl.description)}</p>
        </div>
        <svg class="email-tpl-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>
    `).join('');
  }

  // ── Load saved emails ────────────────────────────────────────
  async function loadHistory() {
    const historyEl = document.getElementById('emails-history');
    const emptyEl = document.getElementById('emails-history-empty');
    if (!historyEl) return;

    const records = await listEmails();

    if (!records.length) {
      if (emptyEl) emptyEl.style.display = '';
      historyEl.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    historyEl.innerHTML = records.map(rec => {
      const icon = iconMap[rec.templateId] || '✉️';
      const tplName = templateNameMap[rec.templateId] || rec.templateId;
      const date = new Date(rec.updatedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
      const recipient = rec.recipientName || rec.recipientEmail || 'Sin destinatario';

      return `
        <div class="email-hist-row" data-id="${escapeHtml(rec.id)}">
          <span class="email-hist-icon">${icon}</span>
          <div class="email-hist-info">
            <p class="email-hist-subject">${escapeHtml(rec.subject || 'Sin asunto')}</p>
            <p class="email-hist-meta">
              <span>${escapeHtml(tplName)}</span>
              <span class="sep">·</span>
              <span>${escapeHtml(recipient)}</span>
              <span class="sep">·</span>
              <span class="date">${date}</span>
            </p>
          </div>
          <div class="email-hist-actions">
            <a href="/correo-editor?id=${encodeURIComponent(rec.id)}" class="btn btn-sm btn-ghost">Editar</a>
            <button type="button" class="btn btn-sm btn-ghost btn-danger em-delete-btn" data-id="${escapeHtml(rec.id)}">Eliminar</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Delete ───────────────────────────────────────────────────
  document.getElementById('emails-history')?.addEventListener('click', async e => {
    const btn = e.target.closest('.em-delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (!confirm('¿Eliminar este borrador de correo?')) return;
    await deleteEmail(id);
    loadHistory();
  });

  // ── Search ───────────────────────────────────────────────────
  function normalizeText(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  document.getElementById('emails-search')?.addEventListener('input', function () {
    const q = normalizeText(this.value);
    document.querySelectorAll('.email-hist-row').forEach(row => {
      const text = normalizeText(row.textContent);
      row.style.display = !q || text.includes(q) ? '' : 'none';
    });
  });

  // ── JSON paste modal (gallery page) ─────────────────────────
  const pasteModal = wireJsonPasteModal('email-json-modal', async (parsed) => {
    // Accept either a full record { email: {...} } or a bare email object
    const emailObj = parsed.email && parsed.email.templateId ? parsed.email : parsed;
    if (!emailObj.templateId) {
      throw new Error('JSON inválido: no contiene templateId.');
    }
    const record = await saveEmail(emailObj);
    window.location.href = `/correo-editor?id=${encodeURIComponent(record.id)}`;
  });

  document.getElementById('btn-paste-json')?.addEventListener('click', () => pasteModal?.open());

  loadHistory();
}
