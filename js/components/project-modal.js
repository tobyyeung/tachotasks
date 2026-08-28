/**
 * project-modal.js
 * Project creation and editing modal with color picker options.
 */

function showProjectModal(editProjectId = null) {
  const existingProj = editProjectId ? state.projects.find(p => p.id === editProjectId) : null;
  const isEditing = !!existingProj;
  const initialColor = existingProj ? (existingProj.color || '#5cb8ff') : '#5cb8ff';
  const initialName = existingProj ? existingProj.name : '';

  const html = `
    <div class="modal-header">
      <h2>${isEditing ? 'Edit Project' : 'New Project'}</h2>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Project Name</label>
        <input class="form-input" id="modal-proj-name" value="${escAttr(initialName)}" placeholder="e.g. Work, Planning, CS374" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="color-picker">
          ${['#5cb8ff', '#00d4aa', '#b47aff', '#ff5c5c', '#ffb347', '#ff6bcb', '#48dbfb', '#ffd93d', '#74b9ff', '#a29bfe'].map(c =>
    `<div class="color-swatch" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c.toLowerCase() === initialColor.toLowerCase() ? 'white' : 'transparent'};transition:all 0.15s ease;"></div>`
  ).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn-primary" id="modal-save-btn">${isEditing ? 'Save Changes' : 'Create'}</button>
    </div>
  `;

  openModal(html);

  let selectedColor = initialColor;
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
      swatch.style.borderColor = 'white';
      selectedColor = swatch.dataset.color;
    });
  });

  const input = document.getElementById('modal-proj-name');
  input.focus();
  input.select();

  const save = async () => {
    const name = input.value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }

    if (isEditing) {
      existingProj.name = name;
      existingProj.color = selectedColor;
      await window.api.saveProjects(state.projects);
      closeModal();
      renderSidebarProjects();
      renderView();
      showToast('Project updated!', 'success');
    } else {
      state.projects.push({
        id: 'proj-' + generateId(),
        name,
        color: selectedColor,
        profileId: null
      });
      await window.api.saveProjects(state.projects);
      closeModal();
      renderSidebarProjects();
      renderView();
      showToast('Project created!', 'success');
    }
  };

  document.getElementById('modal-save-btn').addEventListener('click', save);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}
