import {
  applySettingsToPage,
  getProviderFromSettings,
  getSettings,
  escapeHtml,
  logoMarkup,
} from '../app-settings.js';
import {
  saveEmail,
  getEmailRecord,
  getActiveEmailRecord,
} from '../email-store.js';
import { wireJsonPasteModal } from '../json-paste-modal.js';

export function initEmailEditorPage() {
  const defaultData = JSON.parse(document.getElementById('eeditor-default-data').textContent);
  const templates = JSON.parse(document.getElementById('eeditor-templates').textContent);

  let currentRecord = null;
  let state = {
    email: structuredClone
      ? structuredClone(defaultData.email)
      : JSON.parse(JSON.stringify(defaultData.email)),
  };

  // ── Apply settings ───────────────────────────────────────────
  const settings = getSettings();
  const provider = getProviderFromSettings(settings);
  applySettingsToPage(settings);

  // Provider display fields
  const provNameEl = document.getElementById('ef-prov-name-disp');
  if (provNameEl) provNameEl.value = provider.name || '';
  const provEmailEl = document.getElementById('ef-prov-email-disp');
  if (provEmailEl) provEmailEl.value = provider.email || '';

  // ── Load from URL or active record ──────────────────────────
  (async () => {
    const params = new URLSearchParams(location.search);
    const idParam = params.get('id');
    const newParam = params.get('new');
    const templateParam = params.get('template');

    if (!newParam && idParam) {
      const record = await getEmailRecord(idParam);
      if (record) {
        currentRecord = record;
        state.email = record.email;
      }
    } else if (!newParam && !idParam) {
      const record = await getActiveEmailRecord();
      if (record) {
        currentRecord = record;
        state.email = record.email;
      }
    }

    // Override template if requested
    if (newParam && templateParam) {
      const tpl = templates.find(t => t.templateId === templateParam);
      if (tpl) {
        state.email = {
          templateId: tpl.templateId,
          subject: `${tpl.name} – `,
          recipientEmail: '',
          recipientName: '',
          variables: Object.fromEntries(tpl.variables.map(v => [v, ''])),
          sections: JSON.parse(JSON.stringify(tpl.defaultSections)),
        };
      }
    }

    populateForm(state.email);
    renderSections(state.email.sections);
    updatePreview();
  })();

  // ── DOM helpers ─────────────────────────────────────────────
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  }
  function checked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  // ── Populate form from state ─────────────────────────────────
  function populateForm(email) {
    setVal('ef-template-id', email.templateId);
    setVal('ef-subject', email.subject);
    setVal('ef-recipient-email', email.recipientEmail);
    setVal('ef-recipient-name', email.recipientName);
    setVal('ef-pixel-url', email.trackingPixelUrl || '');

    // Variables
    buildVariableFields(email.templateId, email.variables);

    // Sections
    renderSections(email.sections);
  }

  // ── Build variable fields ────────────────────────────────────
  function buildVariableFields(templateId, currentVars) {
    const tpl = templates.find(t => t.templateId === templateId);
    const container = document.getElementById('ef-variables-container');
    if (!container || !tpl) return;

    if (!tpl.variables.length) {
      container.innerHTML = '<p class="field-hint">Esta plantilla no tiene variables adicionales.</p>';
      return;
    }

    container.innerHTML = tpl.variables.map(varKey => {
      const label = (tpl.variableLabels && tpl.variableLabels[varKey]) || varKey;
      const value = currentVars?.[varKey] || '';
      return `
        <div class="field">
          <label for="ef-var-${varKey}">${escapeHtml(label)}</label>
          <input type="text" id="ef-var-${varKey}" data-var-key="${varKey}" placeholder="{{${varKey}}}" value="${escapeHtml(value)}" />
        </div>
      `;
    }).join('');
  }

  // ── Render sections list ─────────────────────────────────────
  function renderSections(sections) {
    const container = document.getElementById('ef-sections-container');
    if (!container) return;

    const TYPE_LABELS = {
      greeting: 'Saludo',
      paragraph: 'Párrafo',
      'summary-card': 'Tarjeta resumen',
      cta: 'Botón CTA',
      highlight: 'Destacado',
      divider: 'Separador',
    };

    container.innerHTML = sections.map((section, idx) => {
      const label = TYPE_LABELS[section.type] || section.type;
      const isCard = section.type === 'summary-card';
      const isCta = section.type === 'cta';

      return `
        <div class="section-card" data-sec-idx="${idx}">
          <div class="section-header">
            <span class="section-title">${escapeHtml(label)}</span>
            <label class="toggle-label">
              <input type="checkbox" class="ef-sec-visible" data-sec-idx="${idx}" ${section.visible ? 'checked' : ''} />
              <span>Visible</span>
            </label>
          </div>
          <div class="section-body ${!section.visible ? 'sec-hidden' : ''}">
            ${isCard ? renderCardFields(section, idx) : ''}
            ${isCta ? renderCtaFields(section, idx) : ''}
            ${!isCard && !isCta && section.type !== 'divider' ? `
              <div class="field">
                <label>Contenido</label>
                <textarea rows="3" class="ef-sec-content" data-sec-idx="${idx}" placeholder="Escribe el contenido…">${escapeHtml(section.content || '')}</textarea>
              </div>
            ` : ''}
            ${section.type === 'divider' ? '<p class="field-hint">Línea divisora — sin contenido editable.</p>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderCardFields(section, idx) {
    const fields = section.fields || [];
    return `
      <div class="em-card-fields">
        ${fields.map((f, fi) => `
          <div class="field-grid">
            <div class="field">
              <label>Etiqueta</label>
              <input type="text" class="ef-card-label" data-sec-idx="${idx}" data-field-idx="${fi}" value="${escapeHtml(f.label)}" placeholder="Etiqueta…" />
            </div>
            <div class="field">
              <label>Valor</label>
              <input type="text" class="ef-card-value" data-sec-idx="${idx}" data-field-idx="${fi}" value="${escapeHtml(f.value)}" placeholder="Valor o {{variable}}…" />
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderCtaFields(section, idx) {
    return `
      <div class="field-grid">
        <div class="field">
          <label>Texto del botón</label>
          <input type="text" class="ef-cta-text" data-sec-idx="${idx}" value="${escapeHtml(section.text || '')}" placeholder="Ver documento…" />
        </div>
        <div class="field">
          <label>URL (opcional)</label>
          <input type="url" class="ef-cta-url" data-sec-idx="${idx}" value="${escapeHtml(section.url || '')}" placeholder="https://…" />
        </div>
      </div>
    `;
  }

  // ── Read form → email object ─────────────────────────────────
  function readForm() {
    const email = {
      templateId: val('ef-template-id') || state.email.templateId,
      subject: val('ef-subject'),
      recipientEmail: val('ef-recipient-email'),
      recipientName: val('ef-recipient-name'),
      trackingPixelUrl: val('ef-pixel-url'),
      variables: {},
      sections: [],
    };

    // Variables
    document.querySelectorAll('[data-var-key]').forEach(input => {
      email.variables[input.dataset.varKey] = input.value.trim();
    });

    // Sections
    const container = document.getElementById('ef-sections-container');
    if (container) {
      const sectionCards = container.querySelectorAll('[data-sec-idx]');
      const sectionMap = new Map();

      sectionCards.forEach(card => {
        const idx = parseInt(card.dataset.secIdx);
        if (!sectionMap.has(idx)) {
          const orig = state.email.sections[idx];
          sectionMap.set(idx, { ...JSON.parse(JSON.stringify(orig)) });
        }
      });

      // Read visibility
      container.querySelectorAll('.ef-sec-visible').forEach(cb => {
        const idx = parseInt(cb.dataset.secIdx);
        if (sectionMap.has(idx)) sectionMap.get(idx).visible = cb.checked;
      });

      // Read content
      container.querySelectorAll('.ef-sec-content').forEach(ta => {
        const idx = parseInt(ta.dataset.secIdx);
        if (sectionMap.has(idx)) sectionMap.get(idx).content = ta.value;
      });

      // Read CTA
      container.querySelectorAll('.ef-cta-text').forEach(input => {
        const idx = parseInt(input.dataset.secIdx);
        if (sectionMap.has(idx)) sectionMap.get(idx).text = input.value;
      });
      container.querySelectorAll('.ef-cta-url').forEach(input => {
        const idx = parseInt(input.dataset.secIdx);
        if (sectionMap.has(idx)) sectionMap.get(idx).url = input.value;
      });

      // Read card fields
      container.querySelectorAll('.ef-card-label').forEach(input => {
        const idx = parseInt(input.dataset.secIdx);
        const fi = parseInt(input.dataset.fieldIdx);
        if (sectionMap.has(idx) && sectionMap.get(idx).fields?.[fi]) {
          sectionMap.get(idx).fields[fi].label = input.value;
        }
      });
      container.querySelectorAll('.ef-card-value').forEach(input => {
        const idx = parseInt(input.dataset.secIdx);
        const fi = parseInt(input.dataset.fieldIdx);
        if (sectionMap.has(idx) && sectionMap.get(idx).fields?.[fi]) {
          sectionMap.get(idx).fields[fi].value = input.value;
        }
      });

      email.sections = Array.from(sectionMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, s]) => s);
    }

    return email;
  }

  // ── Variable replacement ─────────────────────────────────────
  function buildVars(email) {
    const vars = {
      recipientName: email.recipientName || '',
      recipientEmail: email.recipientEmail || '',
      providerName: provider.name || '',
      providerEmail: provider.email || '',
      providerPhone: provider.phone || '',
      providerCity: provider.city || '',
      providerWebsite: provider.website || '',
      brandName: settings.brand?.shortName || '',
      ...email.variables,
    };
    return vars;
  }

  function replaceVars(text, vars) {
    return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  // ── Update preview ───────────────────────────────────────────
  function updatePreview() {
    const email = readForm();
    state.email = email;
    const vars = buildVars(email);

    // Subject display
    const subjectEl = document.getElementById('em-preview-subject');
    if (subjectEl) subjectEl.textContent = replaceVars(email.subject, vars);

    const body = document.getElementById('em-body');
    if (!body) return;

    // Render sections into the preview
    body.innerHTML = email.sections
      .filter(s => s.visible)
      .map(s => renderSectionHtml(s, vars))
      .join('');
  }

  function renderSectionHtml(section, vars) {
    const rep = text => escapeHtml(replaceVars(text, vars));

    if (section.type === 'greeting') {
      return `<p class="em-greeting">${rep(section.content)}</p>`;
    }
    if (section.type === 'paragraph') {
      return `<p class="em-paragraph">${rep(section.content)}</p>`;
    }
    if (section.type === 'highlight') {
      return `<div class="em-highlight"><p>${rep(section.content)}</p></div>`;
    }
    if (section.type === 'summary-card') {
      const rows = (section.fields || []).map(f =>
        `<div class="em-summary-row">
           <span class="em-summary-label">${rep(f.label)}</span>
           <span class="em-summary-value">${rep(f.value)}</span>
         </div>`
      ).join('');
      return `<div class="em-summary-card">${rows}</div>`;
    }
    if (section.type === 'cta') {
      const url = replaceVars(section.url || '#', vars);
      const text = replaceVars(section.text || 'Ver documento', vars);
      return `<div class="em-cta-wrap"><a class="em-cta-btn" href="${escapeHtml(url)}">${escapeHtml(text)}</a></div>`;
    }
    if (section.type === 'divider') {
      return '<hr class="em-divider" />';
    }
    return '';
  }

  // ── Export HTML (table-based, inline styles) ─────────────────
  function renderEmailHtml(email, vars) {
    const primary = settings.brand?.primaryColor || '#F2B705';
    const accent = settings.brand?.accentColor || '#17A078';
    const brandName = settings.brand?.shortName || 'Cuenta';
    const brandTag = settings.brand?.tagLine || 'Cobro';
    const logoSrc = settings.brand?.logoDataUrl || '';

    const rep = text => String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
    const e = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Header logo
    const logoHtml = logoSrc
      ? `<img src="${e(logoSrc)}" width="32" height="32" alt="${e(brandName)}" style="border-radius:6px;display:block;" />`
      : `<div style="width:32px;height:32px;border-radius:6px;background:#0F0F0F;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${e(primary)};font-family:Georgia,serif;">C</div>`;

    // Sections
    const sectionsHtml = email.sections
      .filter(s => s.visible)
      .map(s => renderSectionEmailHtml(s, rep, e, primary, accent))
      .join('\n');

    // Footer
    const footerLines = [
      provider.name ? `<strong>${e(provider.name)}</strong>` : '',
      [
        provider.email ? `<a href="mailto:${e(provider.email)}" style="color:${e(accent)};text-decoration:none;">${e(provider.email)}</a>` : '',
        provider.phone ? e(provider.phone) : '',
        provider.city ? e(provider.city) : '',
      ].filter(Boolean).join(' &middot; '),
      provider.website ? `<a href="${e(provider.website)}" style="color:${e(accent)};text-decoration:none;">${e(provider.website)}</a>` : '',
    ].filter(Boolean).map(line => `<p style="margin:0 0 4px;font-size:12px;color:#888888;font-family:Arial,sans-serif;">${line}</p>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>${e(rep(email.subject))}</title>
</head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${e(primary)};padding:22px 32px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;">${logoHtml}</td>
                <td style="vertical-align:middle;">
                  <div style="font-size:15px;font-weight:700;color:#0F0F0F;letter-spacing:-0.3px;line-height:1;font-family:Arial,sans-serif;">${e(brandName)}</div>
                  <div style="font-size:10px;font-weight:500;color:rgba(0,0,0,0.55);text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">${e(brandTag)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px;">
            ${sectionsHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #eeeeee;padding:20px 32px;text-align:center;border-radius:0 0 12px 12px;">
            ${footerLines}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
${email.trackingPixelUrl ? `<img src="${e(email.trackingPixelUrl)}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px;" />` : ''}
</body>
</html>`;
  }

  function renderSectionEmailHtml(section, rep, e, primary, accent) {
    if (section.type === 'greeting') {
      return `<p style="font-size:17px;font-weight:700;color:#0F0F0F;margin:0 0 16px;font-family:Arial,sans-serif;line-height:1.4;">${e(rep(section.content))}</p>`;
    }
    if (section.type === 'paragraph') {
      return `<p style="font-size:14px;color:#333333;line-height:1.65;margin:0 0 16px;font-family:Arial,sans-serif;">${e(rep(section.content))}</p>`;
    }
    if (section.type === 'highlight') {
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
        <tr>
          <td style="background:#fefce8;border-left:3px solid ${e(primary)};padding:14px 18px;border-radius:0 6px 6px 0;">
            <p style="font-size:13.5px;color:#444444;line-height:1.6;margin:0;font-family:Arial,sans-serif;">${e(rep(section.content))}</p>
          </td>
        </tr>
      </table>`;
    }
    if (section.type === 'summary-card') {
      const rows = (section.fields || []).map((f, i) => {
        const bg = i % 2 === 0 ? '#f8f8f8' : '#ffffff';
        return `<tr style="background:${bg};">
          <td style="padding:10px 16px;font-size:12px;font-weight:500;color:#777777;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,sans-serif;white-space:nowrap;">${e(rep(f.label))}</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;font-family:Arial,sans-serif;">${e(rep(f.value))}</td>
        </tr>`;
      }).join('');
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin:0 0 16px;">
        <tbody>${rows}</tbody>
      </table>`;
    }
    if (section.type === 'cta') {
      const url = rep(section.url || '#');
      const text = rep(section.text || 'Ver documento');
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">
        <tr>
          <td align="center">
            <a href="${e(url)}" style="display:inline-block;background:${e(primary)};color:#0F0F0F;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;font-family:Arial,sans-serif;">${e(text)}</a>
          </td>
        </tr>
      </table>`;
    }
    if (section.type === 'divider') {
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">
        <tr><td style="border-top:1px solid #eeeeee;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>`;
    }
    return '';
  }

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    const email = readForm();
    state.email = email;
    const record = await saveEmail(email, currentRecord?.id || null);
    currentRecord = record;

    const badge = document.getElementById('ef-save-badge');
    if (badge) {
      badge.textContent = 'Guardado';
      badge.classList.add('saved');
      setTimeout(() => { badge.textContent = ''; badge.classList.remove('saved'); }, 2500);
    }
  }

  // ── Copy HTML ────────────────────────────────────────────────
  async function handleCopyHtml() {
    const email = readForm();
    const vars = buildVars(email);
    const html = renderEmailHtml(email, vars);
    try {
      await navigator.clipboard.writeText(html);
      showToast('¡HTML copiado! Pega en Gmail con Ctrl+Shift+V o pégalo como HTML.');
    } catch {
      showToast('No se pudo copiar. Descarga el archivo .html en su lugar.');
    }
  }

  // ── Download HTML ────────────────────────────────────────────
  function handleDownload() {
    const email = readForm();
    const vars = buildVars(email);
    const html = renderEmailHtml(email, vars);
    const filename = `correo-${(email.templateId || 'email')}-${Date.now()}.html`;
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  // ── Toast ────────────────────────────────────────────────────
  function showToast(msg) {
    const toast = document.getElementById('ef-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => { toast.classList.remove('visible'); }, 3500);
  }

  // ── Section visibility toggle ────────────────────────────────
  document.getElementById('ef-sections-container')?.addEventListener('change', e => {
    if (e.target.classList.contains('ef-sec-visible')) {
      const idx = parseInt(e.target.dataset.secIdx);
      const card = e.target.closest('[data-sec-idx]');
      if (card) {
        const body = card.querySelector('.section-body');
        if (body) body.classList.toggle('sec-hidden', !e.target.checked);
      }
      updatePreview();
    }
  });

  // ── Live preview on any input change ────────────────────────
  const formPanel = document.getElementById('ef-form-panel');
  formPanel?.addEventListener('input', () => updatePreview());

  // ── Template selector ────────────────────────────────────────
  document.getElementById('ef-template-select')?.addEventListener('change', e => {
    const templateId = e.target.value;
    const tpl = templates.find(t => t.templateId === templateId);
    if (!tpl) return;
    state.email = {
      templateId: tpl.templateId,
      subject: state.email.subject || `${tpl.name} – `,
      recipientEmail: state.email.recipientEmail || '',
      recipientName: state.email.recipientName || '',
      variables: Object.fromEntries(tpl.variables.map(v => [v, state.email.variables?.[v] || ''])),
      sections: JSON.parse(JSON.stringify(tpl.defaultSections)),
    };
    document.getElementById('ef-template-id').value = templateId;
    buildVariableFields(templateId, state.email.variables);
    renderSections(state.email.sections);
    updatePreview();
  });

  // ── Download JSON ────────────────────────────────────────────
  function handleDownloadJson() {
    const email = readForm();
    const blob = new Blob([JSON.stringify(email, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `correo-${email.templateId || 'email'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  // ── JSON paste modal (editor: load without navigating away) ──
  const pasteModal = wireJsonPasteModal('email-json-modal', async (parsed) => {
    // Accept either a full record { email: {...} } or a bare email object
    const emailObj = parsed.email && parsed.email.templateId ? parsed.email : parsed;
    if (!emailObj.templateId) {
      throw new Error('JSON inválido: no contiene templateId.');
    }
    state.email = emailObj;
    populateForm(emailObj);
    renderSections(emailObj.sections);
    updatePreview();
    // Rebuild variable fields for the loaded template
    buildVariableFields(emailObj.templateId, emailObj.variables);
  });

  // ── Action buttons ───────────────────────────────────────────
  document.getElementById('ef-btn-save')?.addEventListener('click', handleSave);
  document.getElementById('ef-btn-copy-html')?.addEventListener('click', handleCopyHtml);
  document.getElementById('ef-btn-download')?.addEventListener('click', handleDownload);
  document.getElementById('ef-btn-json-download')?.addEventListener('click', handleDownloadJson);
  document.getElementById('ef-btn-paste-json')?.addEventListener('click', () => pasteModal?.open());
}
