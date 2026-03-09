/**
 * Self-contained editor script injected into page iframes during edit mode.
 * Handles hover highlighting, text editing (contenteditable), and element
 * change requests (floating input). Communicates with the parent renderer
 * via postMessage.
 *
 * All DOM manipulation is vanilla JS — no imports, no JSX.
 */
export const EDITOR_SCRIPT = `
(function() {
  // -- State ------------------------------------------------------------------
  let selectedEl = null;
  let floatingInput = null;
  let originalText = '';

  // -- Styles -----------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = \`
    [data-litho-loc] { cursor: pointer; }
    .litho-hover { outline: 1.5px dashed rgba(232,101,43,0.4); outline-offset: -1.5px; }
    .litho-selected { outline: 1.5px solid rgba(232,101,43,0.8); outline-offset: -1.5px; }
    .litho-floating-input {
      position: absolute;
      z-index: 99999;
      display: flex;
      gap: 6px;
      padding: 6px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      font-family: system-ui, -apple-system, sans-serif;
    }
    .litho-floating-input input {
      width: 260px;
      padding: 6px 10px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      outline: none;
    }
    .litho-floating-input input:focus {
      border-color: #555;
    }
    .litho-floating-input input::placeholder {
      color: #888;
    }
  \`;
  document.head.appendChild(style);

  // -- Helpers ----------------------------------------------------------------

  /** Check if an element contains only direct text (no nested litho-loc elements). */
  function isTextElement(el) {
    if (el.querySelector('[data-litho-loc]')) return false;
    const text = el.textContent?.trim();
    return text && text.length > 0;
  }

  /** Get the direct text content of an element. */
  function getDirectText(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim() || el.textContent?.trim() || '';
  }

  function sendMessage(data) {
    window.parent.postMessage({ source: 'litho-editor', ...data }, '*');
  }

  /** Return the element's className with litho-* editor classes stripped. */
  function getCleanClasses(el) {
    return (el.className || '').split(/\\s+/).filter(function(c) { return c && !c.startsWith('litho-'); }).join(' ');
  }

  /** Get clean outerHTML of the element with editor artifacts stripped. */
  function getCleanOuterHtml(el) {
    var clone = el.cloneNode(true);
    // Strip all data-litho-loc attributes
    clone.removeAttribute('data-litho-loc');
    clone.removeAttribute('contenteditable');
    var nested = clone.querySelectorAll('[data-litho-loc]');
    for (var i = 0; i < nested.length; i++) {
      nested[i].removeAttribute('data-litho-loc');
    }
    // Strip litho-* classes from all elements
    var allEls = [clone].concat(Array.from(clone.querySelectorAll('*')));
    for (var j = 0; j < allEls.length; j++) {
      var c = allEls[j].className;
      if (c && typeof c === 'string') {
        allEls[j].className = c.split(/\\s+/).filter(function(cls) { return cls && !cls.startsWith('litho-'); }).join(' ');
      }
    }
    var html = clone.outerHTML;
    // Truncate if very large
    if (html.length > 1000) {
      html = html.slice(0, 1000) + '... (truncated)';
    }
    return html;
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.classList.remove('litho-selected');
      selectedEl.removeAttribute('contenteditable');
      selectedEl = null;
    }
    removeFloatingInput();
  }

  function removeFloatingInput() {
    if (floatingInput) {
      floatingInput.remove();
      floatingInput = null;
    }
  }

  function showFloatingInput(el) {
    removeFloatingInput();

    const rect = el.getBoundingClientRect();
    const div = document.createElement('div');
    div.className = 'litho-floating-input';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Describe the change...';

    input.addEventListener('keydown', function(e) {
      e.stopPropagation();
      if (e.key === 'Enter' && input.value.trim()) {
        const loc = el.getAttribute('data-litho-loc');
        const pageId = loc ? loc.split(':')[0] : '';
        sendMessage({
          type: 'change-request',
          pageId: pageId,
          loc: loc,
          elementInfo: {
            tagName: el.tagName.toLowerCase(),
            classes: getCleanClasses(el),
            textContent: (el.textContent || '').trim().slice(0, 50),
            outerHtml: getCleanOuterHtml(el),
          },
          description: input.value.trim(),
        });
        clearSelection();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    });

    input.addEventListener('blur', function() {
      // Small delay to allow click events on the input itself
      setTimeout(function() {
        if (floatingInput && !floatingInput.contains(document.activeElement)) {
          clearSelection();
        }
      }, 150);
    });

    div.appendChild(input);
    document.body.appendChild(div);
    floatingInput = div;

    // Position above the element (or below if not enough space)
    const inputHeight = 44;
    const gap = 8;
    let top = rect.top + window.scrollY - inputHeight - gap;
    if (top < 4) {
      top = rect.bottom + window.scrollY + gap;
    }
    let left = rect.left + window.scrollX;
    // Clamp to viewport
    const maxLeft = document.documentElement.clientWidth - 290;
    if (left > maxLeft) left = Math.max(4, maxLeft);

    div.style.top = top + 'px';
    div.style.left = left + 'px';

    // Only auto-focus for non-text elements; for text elements the user
    // chooses between inline editing and the prompt input.
    if (!isTextElement(el)) {
      input.focus();
    }
  }

  /** Skip the root page element — selecting the whole page isn't useful. */
  function isRootElement(el) {
    return el.parentElement && !el.parentElement.closest('[data-litho-loc]');
  }

  // -- Event Handlers ---------------------------------------------------------

  document.addEventListener('mouseover', function(e) {
    const el = e.target.closest('[data-litho-loc]');
    if (el && el !== selectedEl && !isRootElement(el)) {
      el.classList.add('litho-hover');
    }
  });

  document.addEventListener('mouseout', function(e) {
    const el = e.target.closest('[data-litho-loc]');
    if (el) {
      el.classList.remove('litho-hover');
    }
  });

  document.addEventListener('click', function(e) {
    // Ignore clicks on the floating input
    if (floatingInput && floatingInput.contains(e.target)) return;

    const el = e.target.closest('[data-litho-loc]');

    // Click outside any litho element or on the root page element — deselect
    if (!el || isRootElement(el)) {
      clearSelection();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // If clicking the already-selected element, do nothing
    if (el === selectedEl) return;

    // Deselect previous
    clearSelection();

    // Select new element
    selectedEl = el;
    el.classList.remove('litho-hover');
    el.classList.add('litho-selected');

    // Always show floating input for prompt-based changes
    showFloatingInput(el);

    if (isTextElement(el)) {
      // Also enable inline text editing
      originalText = getDirectText(el);
      el.setAttribute('contenteditable', 'plaintext-only');

      el.addEventListener('blur', function onBlur() {
        // Don't finalize if focus moved to the floating input
        if (floatingInput && floatingInput.contains(document.activeElement)) return;
        el.removeEventListener('blur', onBlur);
        const newText = getDirectText(el);
        if (newText !== originalText) {
          const loc = el.getAttribute('data-litho-loc');
          const pageId = loc ? loc.split(':')[0] : '';
          sendMessage({
            type: 'text-change',
            pageId: pageId,
            loc: loc,
            oldText: originalText,
            newText: newText,
          });
        }
        el.removeAttribute('contenteditable');
        // Only deselect if there's no floating input active
        if (!floatingInput) {
          el.classList.remove('litho-selected');
          selectedEl = null;
        }
      }, { once: true });
    }
  });

  // Prevent default link navigation and form submission
  document.addEventListener('click', function(e) {
    if (e.target.closest('a')) e.preventDefault();
  }, true);
})();
`;
