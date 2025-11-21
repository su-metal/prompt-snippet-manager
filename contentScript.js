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
    buttonEl.textContent = "✏️";
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

    // events
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

      item.addEventListener("click", () => {
        insertIntoChatGPT(s.body);
      });

      body.appendChild(item);
    });
  }

  function findChatGPTTextarea() {
    // ChatGPT の入力欄をできるだけ広く探す
    const selectors = [
      'textarea[placeholder*="Send a message"]',
      'textarea[placeholder*="Message ChatGPT"]',
      'textarea[placeholder*="メッセージを入力"]',
      'textarea[placeholder*="メッセージを送信"]',
      'textarea[data-id="root"]',
      "form textarea",
      'div[contenteditable="true"][data-testid="textbox"]',
      'div[contenteditable="true"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    return null;
  }

  function insertIntoChatGPT(text) {
    const inputEl = findChatGPTTextarea();
    if (!inputEl) {
      alert("ChatGPT の入力欄が見つかりませんでした。");
      return;
    }

    // textarea の場合（今の ChatGPT はこちらが多い）
    if (inputEl.tagName.toLowerCase() === "textarea") {
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;
      const before = inputEl.value.slice(0, start);
      const after = inputEl.value.slice(end);
      const newValue = before + text + after;

      // React 対応：value セッターを直接呼ぶ
      const prototype = window.HTMLTextAreaElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(
        prototype,
        "value"
      )?.set;
      if (valueSetter) {
        valueSetter.call(inputEl, newValue);
      } else {
        inputEl.value = newValue;
      }

      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.focus();
      const cursorPos = before.length + text.length;
      inputEl.selectionStart = inputEl.selectionEnd = cursorPos;
      return;
    }

    // contenteditable な場合（保険）
    if (inputEl.isContentEditable) {
      inputEl.focus();
      const selection = window.getSelection();
      if (!selection) {
        document.execCommand("insertText", false, text);
        return;
      }
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(inputEl);
      range.collapse(false); // 一番最後
      selection.addRange(range);
      document.execCommand("insertText", false, text);
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
