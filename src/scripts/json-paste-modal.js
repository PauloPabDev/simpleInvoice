/**
 * Wires up a JSON paste modal.
 * @param {string} modalId - The id of the modal element (matches JsonPasteModal's modalId prop)
 * @param {(parsed: object) => Promise<void>} onImport - Called with the parsed JSON on success
 * @returns {{ open: () => void, close: () => void } | null}
 */
export function wireJsonPasteModal(modalId, onImport) {
  const modal    = document.getElementById(modalId);
  if (!modal) return null;

  const textarea = document.getElementById(`${modalId}-textarea`);
  const errorEl  = document.getElementById(`${modalId}-error`);
  const importBtn = modal.querySelector('.json-modal-import');

  function open() {
    textarea.value = '';
    errorEl.hidden = true;
    importBtn.disabled = false;
    importBtn.textContent = 'Importar';
    modal.hidden = false;
    textarea.focus();
  }

  function close() {
    modal.hidden = true;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  modal.querySelector('.json-modal-backdrop')?.addEventListener('click', close);
  modal.querySelector('.json-modal-close')?.addEventListener('click', close);
  modal.querySelector('.json-modal-cancel')?.addEventListener('click', close);

  document.addEventListener('keydown', e => {
    if (!modal.hidden && e.key === 'Escape') close();
  });

  importBtn?.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) { showError('El campo está vacío.'); return; }
    try {
      const parsed = JSON.parse(text);
      errorEl.hidden = true;
      importBtn.disabled = true;
      importBtn.textContent = 'Importando…';
      await onImport(parsed);
      close();
    } catch (err) {
      importBtn.disabled = false;
      importBtn.textContent = 'Importar';
      showError('JSON inválido: ' + err.message);
    }
  });

  return { open, close };
}
