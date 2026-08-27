/**
 * project-modal.js
 * Project & List creation modal with color picker options.
 */

function showProjectModal(parentId = null) {
  const html = `
    <div class="modal-header">
      <h2>${parentId ? 'New List' : 'New Project'}</h2>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input class="form-input" id="modal-proj-name" placeholder="e.g. Work, Personal" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="color-picker">
          ${['#5cb8ff', '#00d4aa', '#b47aff', '#ff5c5c', '#ffb347', '#ff6bcb', '#48dbfb', '#ffd93d'].map(c =>
    `<div class="color-swatch" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;transition:all 0.15s ease;"></div>`
  ).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn-primary" id="modal-save-btn">Create</button>
    </div>
  `;

  openModal(html);

  let selectedColor = '#5cb8ff';
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
      swatch.style.borderColor = 'white';
      selectedColor = swatch.dataset.color;
    });
  });
  // Select first by default
  const firstSwatch = document.querySelector('.color-swatch');
  if (firstSwatch) firstSwatch.style.borderColor = 'white';

  document.getElementById('modal-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('modal-proj-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    state.projects.push({
      id: 'proj-' + generateId(),
      name,
      color: selectedColor,
      parentProjectId: parentId,
      profileId: null
    });
    await window.api.saveProjects(state.projects);
    closeModal();
    renderSidebarProjects();
    showToast('Project created!', 'success');
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
}
