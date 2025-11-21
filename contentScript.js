const PSM_STORAGE_KEY = "promptSnippets";

(function () {
  let panelVisible = false;
  let panelEl = null;
  let buttonEl = null;
  let snippets = [];
  let currentCategoryFilter = "";
  let searchQuery = "";
  let favoritesOnly = false;

  function init() {
    if (buttonEl) return;

    buttonEl = document.createElement("button");
    buttonEl.className = "psm-floating-button";
    buttonEl.title = "Prompt Snippet Manager";
    buttonEl.textContent = "✂";
    buttonEl.addEventListener("click", togglePanel);

    document.body.appendChild(buttonEl);

    loadSnippets();
    chrome.storage.sync.onChanged.addListener(handleStorageChange);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "sync") return;
    if (changes[PSM_STORAGE_KEY]) {
      snippets = changes[PSM_STORAGE_KEY].newValue || [];
      renderPanelBody();
      renderCategorySelect();
    }
  }

  function loadSnippets() {
    chrome.storage.sync.get([PSM_STORAGE_KEY], (result) => {
      snippets = result[PSM_STORAGE_KEY] || [];
      if (panelVisible) {
        renderPanelBody();
        renderCategorySelect();
      }
    });
  }

  function togglePanel() {
    panelVisible = !panelVisible;
    if (panelVisible) {
      showPanel();
    } else {
      hidePanel();
    }
  }

  function showPanel() {
    if (!panelEl) {
      createPanel();
    }
    panelEl.style.display = "flex";
    renderPanelBody();
    renderCategorySelect();
  }

  function hidePanel() {
    if (panelEl) {
      panelEl.style.display = "none";
    }
  }

  function createPanel() {
    panelEl = document.createElement("div");
    panelEl.className = "psm-panel";

    const header = document.createElement("div");
    header.className = "psm-panel-header";

    const title = document.createElement("div");
    title.className = "psm-panel-header-title";
    title.textContent = "Prompt Snippets";

    const controls = document.createElement("div");
    controls.className = "psm-panel-header-controls";

    const categorySelect = document.createElement("select");
    categorySelect.id = "psm-category-select";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search…";

    const favButton = document.createElement("button");
    favButton.id = "psm-fav-filter";
    favButton.textContent = "★ All";

    const closeButton = document.createElement("button");
    closeButton.textContent = "×";

    controls.appendChild(categorySelect);
    controls.appendChild(searchInput);
    controls.appendChild(favButton);
    controls.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(controls);

    const body = document.createElement("div");
    body.className = "psm-panel-body";
    body.id = "psm-panel-body";

    panelEl.appendChild(header);
    panelEl.appendChild(body);

    document.body.appendChild(panelEl);

    categorySelect.addEventListener("change", (e) => {
      currentCategoryFilter = e.target.value;
      renderPanelBody();
    });

    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderPanelBody();
    });

    favButton.addEventListener("click", () => {
      favoritesOnly = !favoritesOnly;
      favButton.textContent = favoritesOnly ? "★ Fav" : "★ All";
      renderPanelBody();
    });

    closeButton.addEventListener("click", () => {
      panelVisible = false;
      hidePanel();
    });
  }

  function renderCategorySelect() {
    if (!panelEl) return;
    const select = panelEl.querySelector("#psm-category-select");
    if (!select) return;

    const categories = Array.from(
      new Set(
        snippets.map((s) => s.category && s.category.trim()).filter(Boolean)
      )
    ).sort();

    const current = select.value;
    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All";
    select.appendChild(allOpt);

    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });

    if (categories.includes(current)) {
      select.value = current;
    }
  }

  function matchesFilter(snippet) {
    if (currentCategoryFilter && snippet.category !== currentCategoryFilter) {
      return false;
    }
    if (favoritesOnly && !snippet.favorite) return false;

    if (searchQuery) {
      const haystack = [
        snippet.title,
        snippet.category,
        snippet.body,
        ...(snippet.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }

    return true;
  }

  function renderPanelBody() {
    if (!panelEl) return;
    const body = panelEl.querySelector("#psm-panel-body");
    if (!body) return;

    body.innerHTML = "";

    const filtered = snippets.filter(matchesFilter);

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No snippets. Open the extension popup to add.";
      empty.style.fontSize = "0.75rem";
      empty.style.color = "#9ca3af";
      body.appendChild(empty);
      return;
    }

    filtered.forEach((s) => {
      const item = document.createElement("div");
      item.className = "psm-snippet";
      const titleEl = document.createElement("div");
      titleEl.className = "psm-snippet-title";
      titleEl.textContent = s.title + (s.favorite ? " ★" : "");
      const metaEl = document.createElement("div");
      metaEl.className = "psm-snippet-meta";
      metaEl.textContent = s.category || "";
      const tagsEl = document.createElement("div");
      tagsEl.className = "psm-snippet-tags";
      if (s.tags && s.tags.length > 0) {
        tagsEl.textContent = s.tags.map((t) => `#${t}`).join(" ");
      } else {
        tagsEl.style.display = "none";
      }

      item.appendChild(titleEl);
      item.appendChild(metaEl);
      item.appendChild(tagsEl);

      // ★ ここを変更：クリック時にテンプレート変数を展開してから挿入
      item.addEventListener("click", () => {
        const filled = fillTemplate(s.body);
        if (filled !== null) {
          insertIntoChatGPT(filled);
        }
      });

      body.appendChild(item);
    });
  }

  function findChatGPTTextarea() {
    const selectors = [
      'textarea[placeholder*="Send a message"]',
      'textarea[placeholder*="Message ChatGPT"]',
      'textarea[placeholder*="メッセージを入力"]',
      'textarea[placeholder*="メッセージを送信"]',
      'textarea[placeholder*="message"]',
      'textarea[data-id="root"]',
      'textarea[data-id="prompt-textarea"]',
      'textarea[role="textbox"]',
      '#prompt-textarea',
      'form textarea',
      'div[contenteditable="true"][data-testid="textbox"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][data-lexical-editor]',
      'div[contenteditable="true"][data-message-editor="true"]',
      'div[contenteditable="true"]',
    ];

    for (const sel of selectors) {
      const match = getCandidatesFromSelector(sel);
      if (match.length > 0) {
        return match[0];
      }
    }

    const fallbacks = [
      ...getCandidatesFromSelector("textarea"),
      ...getCandidatesFromSelector('div[contenteditable="true"]'),
    ];

    return fallbacks[0] || null;
  }

  function getCandidatesFromSelector(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(isUsableInput);
  }

  // ===== プレースホルダ処理ここから =====

  // スニペット本文から {{name}} のプレースホルダ名一覧を抽出
  function extractPlaceholders(template) {
    const regex = /{{\s*([^\{\}\s]+)\s*}}/g;
    const names = new Set();
    let match;
    while ((match = regex.exec(template)) !== null) {
      names.add(match[1]);
    }
    return Array.from(names);
  }

  // プレースホルダごとに prompt で聞いて、埋め込み済み文字列を返す
  // キャンセルされたら null を返す
  function fillTemplate(template) {
    const placeholders = extractPlaceholders(template);
    if (placeholders.length === 0) {
      return template;
    }

    let filled = template;
    for (const name of placeholders) {
      const value = window.prompt(`「${name}」に入れる内容を入力してください:`, "");
      if (value === null) {
        // キャンセルされたら挿入自体を中止
        return null;
      }
      const regex = new RegExp(`{{\\s*${name}\\s*}}`, "g");
      filled = filled.replace(regex, value);
    }

    return filled;
  }

  // ===== プレースホルダ処理ここまで =====

  function insertIntoChatGPT(text) {
    const inputEl = findChatGPTTextarea();
    if (!inputEl) {
      alert("ChatGPT input area not found.");
      return;
    }

    if (inputEl.tagName.toLowerCase() === "textarea") {
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;
      const before = inputEl.value.slice(0, start);
      const after = inputEl.value.slice(end);
      const newValue = before + text + after;

      setNativeValue(inputEl, newValue);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.focus();
      const cursorPos = before.length + text.length;
      inputEl.selectionStart = inputEl.selectionEnd = cursorPos;
      return;
    }

    if (inputEl.isContentEditable) {
      inputEl.focus();
      const selection = window.getSelection();
      let range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

      if (!range || !inputEl.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(inputEl);
        range.collapse(false);
      }

      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection?.removeAllRanges();
      selection?.addRange(range);

      const inputEvent =
        typeof InputEvent !== "undefined"
          ? new InputEvent("input", {
              bubbles: true,
              data: text,
              inputType: "insertText",
            })
          : new Event("input", { bubbles: true });
      inputEl.dispatchEvent(inputEvent);
    }
  }

  function isUsableInput(el) {
    if (!el) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (el instanceof HTMLTextAreaElement || el.isContentEditable) {
      return el.getClientRects().length > 0 || el.offsetHeight > 0;
    }
    return false;
  }

  function setNativeValue(element, value) {
    const nativePrototype = Object.getPrototypeOf(element);
    const descriptor =
      (nativePrototype && Object.getOwnPropertyDescriptor(nativePrototype, "value")) ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value") ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const setter = descriptor?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init);
  }
})();
