/**
 * modal-base.js
 * Core modal and draggable popup container management, inspector sidebar, and toast notifications.
 */

// ===== MODAL OVERLAY MANAGEMENT =====
function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  container.innerHTML = html;
  overlay.classList.remove('hidden');

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (overlay) overlay.classList.add('hidden');
  if (container) container.innerHTML = '';

  // Also close any draggable popups
  document.querySelectorAll('.draggable-popup').forEach(el => el.remove());
}

// ===== DRAGGABLE POPUP MANAGEMENT =====
function openDraggablePopup(html, popupId) {
  // Remove existing
  const existing = document.getElementById(popupId);
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = popupId;
  popup.className = 'draggable-popup';
  popup.innerHTML = html;

  // Apply initial styles for floating panel
  Object.assign(popup.style, {
    position: 'fixed',
    top: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: '94vw',
    zIndex: '9999',
    boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--border-glow)'
  });

  document.body.appendChild(popup);

  // Dragging logic
  const handle = popup.querySelector('.draggable-handle') || popup.querySelector('.task-modal-top-bar') || popup;
  if (handle) {
    handle.style.cursor = 'grab';
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener('mousedown', (e) => {
      // Don't drag if clicking interactive elements
      if (e.target.closest('button, input, textarea, select, .more-options-wrapper, .task-breadcrumb')) return;

      isDragging = true;
      handle.style.cursor = 'grabbing';

      const rect = popup.getBoundingClientRect();
      // Switch from transform-based centering to exact pixel position on drag start
      popup.style.transform = 'none';
      popup.style.left = `${rect.left}px`;
      popup.style.top = `${rect.top}px`;

      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Boundary constraints
        newLeft = Math.max(10, Math.min(window.innerWidth - popup.offsetWidth - 10, newLeft));
        newTop = Math.max(10, Math.min(window.innerHeight - popup.offsetHeight - 10, newTop));

        popup.style.left = `${newLeft}px`;
        popup.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ===== INSPECTOR SIDEBAR =====
function openInspector(html) {
  const inspector = document.getElementById('task-inspector');
  const main = document.getElementById('main');
  const content = document.getElementById('inspector-content');
  if (!inspector || !main || !content) return;

  content.innerHTML = html;
  inspector.classList.add('open');
  main.classList.add('inspector-open');
}

function closeInspector() {
  const inspector = document.getElementById('task-inspector');
  const main = document.getElementById('main');
  const content = document.getElementById('inspector-content');
  if (!inspector || !main || !content) return;

  inspector.classList.remove('open');
  main.classList.remove('inspector-open');
  setTimeout(() => {
    if (!inspector.classList.contains('open')) {
      content.innerHTML = '';
    }
  }, 250);
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : '✕';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> ${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
