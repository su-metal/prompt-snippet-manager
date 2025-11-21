const PSM_STORAGE_KEY = "promptSnippets";
const FREE_SNIPPET_LIMIT = 5; // Free plan limit
const MAX_FREE_PLACEHOLDER_NAMES = 1; // Free: 1 distinct placeholder name per snippet

const IS_PRO = true;

let snippets = [];
let filteredSnippets = [];
let currentSearch = "";
let currentCategoryFilter = "";
let favoritesOnly = false;

document.addEventListener("DOMContentLoaded", () => {
  const titleInput = document.getElementById("title");
  const categoryInput = document.getElementById("category");
  const tagsInput = document.getElementById("tags");
  const bodyInput = document.getElementById("body");
  const favoriteInput = document.getElementById("favorite");
  const editingIdInput = document.getElementById("editingId");

  const saveBtn = document.getElementById("saveBtn");
  const clearBtn = document.getElementById("clearBtn");

  const searchInput = document.getElementById("search");
  const categoryFilterSelect = document.getElementById("categoryFilter");
  const favoriteFilterInput = document.getElementById("favoriteFilter");

  const snippetList = document.getElementById("snippetList");
  const snippetCount = document.getElementById("snippetCount");

  // ====== Drag & Drop sort ======
  let sortableInstance = null;

  function enableDragSort() {
    // すでに有効なら二重初期化しない
    if (sortableInstance) return;
    if (!snippetList) return;
    if (typeof Sortable === "undefined") return;

    sortableInstance = new Sortable(snippetList, {
      animation: 120,
      onEnd: function () {
        // 並べ替え後の順番で snippets を並び替えて保存
        const items = Array.from(snippetList.children);
        const idOrder = items.map((li) => li.getAttribute("data-id"));

        const newOrder = [];
        idOrder.forEach((id) => {
          const sn = snippets.find((s) => s.id === id);
          if (sn) newOrder.push(sn);
        });

        // 見つからなかったものも一応末尾に保持
        snippets.forEach((sn) => {
          if (!newOrder.includes(sn)) newOrder.push(sn);
        });

        snippets = newOrder;

        saveSnippetsToStorage().then(() => {
          applyFilters();
          renderCategoryFilter();
          renderList();
        });
      },
    });
  }

  const addPlaceholderBtn = document.getElementById("addPlaceholderBtn");

  // ====== Banner UI (in-popup error/limit messages near actions) ======
  const actionsRow = saveBtn.closest(".actions") || saveBtn.parentElement;
  const bannerEl = document.createElement("div");
  bannerEl.id = "psm-banner";
  bannerEl.style.display = "none";
  bannerEl.style.boxSizing = "border-box";
  bannerEl.style.marginTop = "0.5rem";
  bannerEl.style.marginBottom = "0.5rem";
  if (actionsRow && actionsRow.parentNode) {
    actionsRow.parentNode.insertBefore(bannerEl, actionsRow);
  }

  let bannerTimeoutId = null;

  function showBanner(
    message,
    { variant = "error", showUpgrade = false } = {}
  ) {
    bannerEl.innerHTML = "";
    bannerEl.style.display = "flex";
    bannerEl.style.flexWrap = "wrap"; // 長文でも折り返せるように
    bannerEl.style.alignItems = "flex-start";
    bannerEl.style.justifyContent = "space-between";
    bannerEl.style.gap = "0.75rem";
    bannerEl.style.padding = "0.6rem 0.9rem";
    bannerEl.style.borderRadius = "12px"; // 999px → 12px にしてカード感を出す
    bannerEl.style.fontSize = "0.78rem";
    bannerEl.style.borderWidth = "1px";
    bannerEl.style.borderStyle = "solid";
    bannerEl.style.cursor = "default";
    bannerEl.style.maxWidth = "100%";
    bannerEl.style.overflow = "hidden"; // 万一のはみ出し防止

    if (variant === "warning") {
      bannerEl.style.background = "#fef3c7";
      bannerEl.style.color = "#92400e";
      bannerEl.style.borderColor = "#fde68a";
    } else {
      bannerEl.style.background = "#fee2e2";
      bannerEl.style.color = "#b91c1c";
      bannerEl.style.borderColor = "#fecaca";
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    textSpan.style.flex = "1 1 auto";
    textSpan.style.minWidth = "0";
    textSpan.style.lineHeight = "1.4";
    textSpan.style.whiteSpace = "pre-line"; // \n を改行として表示
    textSpan.style.wordBreak = "break-word"; // 長い単語があってもはみ出さない
    bannerEl.appendChild(textSpan);

    if (showUpgrade) {
      const upgradeBtn = document.createElement("button");
      upgradeBtn.textContent = "Upgrade";
      upgradeBtn.style.border = "none";
      upgradeBtn.style.borderRadius = "999px";
      upgradeBtn.style.padding = "0.25rem 0.9rem";
      upgradeBtn.style.fontSize = "0.75rem";
      upgradeBtn.style.fontWeight = "500";
      upgradeBtn.style.cursor = "pointer";
      upgradeBtn.style.background = "#2563eb";
      upgradeBtn.style.color = "#ffffff";
      upgradeBtn.style.boxShadow = "0 4px 10px rgba(37, 99, 235, 0.35)";
      upgradeBtn.style.flexShrink = "0"; // 狭いときにも潰れない
      upgradeBtn.style.alignSelf = "center"; // 縦位置を中央寄せに
      upgradeBtn.style.marginLeft = "0.25rem";

      upgradeBtn.addEventListener("click", () => {
        // TODO: 課金ページ or LP の URL に差し替えてください
        window.open("https://example.com/upgrade", "_blank");
      });
      bannerEl.appendChild(upgradeBtn);
    }

    if (bannerTimeoutId) {
      clearTimeout(bannerTimeoutId);
    }
    bannerTimeoutId = setTimeout(() => {
      bannerEl.style.display = "none";
    }, 7000);
  }

  function showError(message) {
    // 入力エラーなど、純粋なエラー用
    showBanner(message, { variant: "error", showUpgrade: false });
  }

  function showLimitError(message) {
    // Free プランの上限（件数 / プレースホルダ）に引っかかったとき用
    showBanner(message, { variant: "warning", showUpgrade: true });
  }

  // Load initial data
  loadSnippets().then(() => {
    applyFilters();
    renderCategoryFilter();
    renderList();
  });

  // ====== Storage helpers ======

  function loadSnippets() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([PSM_STORAGE_KEY], (result) => {
        snippets = result[PSM_STORAGE_KEY] || [];
        // Sort by updatedAt desc as a default
        snippets.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve();
      });
    });
  }

  function saveSnippetsToStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [PSM_STORAGE_KEY]: snippets }, () => resolve());
    });
  }

  // ====== Placeholder helpers ======

  function extractPlaceholderNames(body) {
    if (!body) return [];
    const regex = /{{\s*([^\{\}\s]+)\s*}}/g;
    const names = new Set();
    let match;
    while ((match = regex.exec(body)) !== null) {
      names.add(match[1]);
    }
    return Array.from(names);
  }

  function validateFreePlaceholderLimit(body) {
    const names = extractPlaceholderNames(body);
    if (names.length <= MAX_FREE_PLACEHOLDER_NAMES) return { ok: true };

    return {
      ok: false,
      names,
    };
  }

  // ====== Filters ======

  function applyFilters() {
    filteredSnippets = snippets.filter((s) => {
      if (currentCategoryFilter && s.category !== currentCategoryFilter) {
        return false;
      }

      if (favoritesOnly && !s.favorite) {
        return false;
      }

      if (currentSearch) {
        const haystack = [
          s.title || "",
          s.category || "",
          s.body || "",
          ...(s.tags || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(currentSearch.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }

  function renderCategoryFilter() {
    const categories = Array.from(
      new Set(
        snippets
          .map((s) => (s.category || "").trim())
          .filter((c) => c.length > 0)
      )
    ).sort();

    const current = categoryFilterSelect.value;
    categoryFilterSelect.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All categories";
    categoryFilterSelect.appendChild(allOpt);

    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      categoryFilterSelect.appendChild(opt);
    });

    if (categories.includes(current)) {
      categoryFilterSelect.value = current;
    } else {
      categoryFilterSelect.value = "";
      currentCategoryFilter = "";
    }
  }

  // ====== List rendering ======

  function renderList() {
    snippetList.innerHTML = "";

    if (snippetCount) {
      snippetCount.textContent =
        filteredSnippets.length === 0
          ? "No snippets"
          : `${filteredSnippets.length} snippet${
              filteredSnippets.length === 1 ? "" : "s"
            }`;
    }

    if (filteredSnippets.length === 0) {
      return;
    }

    const template = document.getElementById("snippetItemTemplate");
    filteredSnippets.forEach((snippet, index) => {
      const clone = template.content.cloneNode(true);
      const li = clone.querySelector(".snippet-item");
      const titleEl = clone.querySelector(".snippet-title");
      const categoryEl = clone.querySelector(".snippet-category");
      const tagsEl = clone.querySelector(".snippet-tags");
      const placeholdersEl = clone.querySelector(".snippet-placeholders");
      const editBtn = clone.querySelector(".edit-btn");
      const deleteBtn = clone.querySelector(".delete-btn");

      // ★ 並び替え後に ID で順番を復元するため、data-id を付ける
      li.setAttribute("data-id", snippet.id);

      titleEl.textContent = snippet.title || "(Untitled)";
      if (snippet.favorite) {
        titleEl.textContent += " ★";
      }

      if (snippet.category) {
        categoryEl.textContent = snippet.category;
      } else {
        categoryEl.style.display = "none";
      }

      if (snippet.tags && snippet.tags.length > 0) {
        tagsEl.textContent = snippet.tags.map((t) => `#${t}`).join(" ");
      } else {
        tagsEl.style.display = "none";
      }

      // Placeholder info (for UX only)
      const placeholderNames = extractPlaceholderNames(snippet.body || "");
      if (placeholderNames.length > 0) {
        placeholdersEl.textContent =
          "Placeholders: " + placeholderNames.map((n) => `"${n}"`).join(" ");
      } else {
        placeholdersEl.style.display = "none";
      }

      // ★ Free モードでは 5件目以降をロック扱いにする
      const isLocked = !IS_PRO && index >= FREE_SNIPPET_LIMIT;

      if (isLocked) {
        // 見た目用クラス（CSS 側で半透明などにする想定）
        li.classList.add("snippet-item-locked");

        // タイトル横に Pro バッジを追加
        const headerEl = li.querySelector(".snippet-header");
        if (headerEl) {
          const proBadge = document.createElement("span");
          proBadge.className = "snippet-pro-badge";
          proBadge.textContent = "Pro";
          headerEl.appendChild(proBadge);
        }

        // Edit ボタンは編集ではなく Upgrade 誘導にする
        editBtn.textContent = "Upgrade";
        editBtn.addEventListener("click", () => {
          showLimitError(
            `In the Free plan you can actively use up to ${FREE_SNIPPET_LIMIT} snippets.\nUpgrade to unlock and use all saved snippets.`
          );
        });
      } else {
        // 通常の Edit 挙動
        editBtn.addEventListener("click", () => {
          startEditing(snippet.id);
        });
      }

      // Delete は常に有効（ロックされていても削除はできる）
      deleteBtn.addEventListener("click", () => {
        if (
          confirm(
            `Delete snippet "${
              snippet.title || "(Untitled)"
            }"? This cannot be undone.`
          )
        ) {
          snippets = snippets.filter((s) => s.id !== snippet.id);
          saveSnippetsToStorage().then(() => {
            applyFilters();
            renderCategoryFilter();
            renderList();
            // If we were editing this one, clear the form
            if (editingIdInput.value === snippet.id) {
              clearForm();
            }
          });
        }
      });

      snippetList.appendChild(clone);
    });
    // ★ リスト描画が終わったら、ドラッグ＆ドロップを有効化
    enableDragSort();
  }

  // ====== Editing ======

  function clearForm() {
    titleInput.value = "";
    categoryInput.value = "";
    tagsInput.value = "";
    bodyInput.value = "";
    favoriteInput.checked = false;
    editingIdInput.value = "";
  }

  function startEditing(id) {
    const snippet = snippets.find((s) => s.id === id);
    if (!snippet) return;
    titleInput.value = snippet.title || "";
    categoryInput.value = snippet.category || "";
    tagsInput.value = (snippet.tags || []).join(", ");
    bodyInput.value = snippet.body || "";
    favoriteInput.checked = !!snippet.favorite;
    editingIdInput.value = snippet.id;
  }

  // ====== Save logic (with Free plan limits) ======

  saveBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    const category = categoryInput.value.trim();
    const tagsRaw = tagsInput.value.trim();
    const body = bodyInput.value.trim();
    const favorite = favoriteInput.checked;
    const editingId = editingIdInput.value;

    if (!title) {
      showError("Please enter a title.");
      return;
    }

    if (!body) {
      showError("Please enter the prompt body.");
      return;
    }

    // 1) Free plan placeholder limit check（Pro ではスキップ）
    if (!IS_PRO) {
      const placeholderCheck = validateFreePlaceholderLimit(body);
      if (!placeholderCheck.ok) {
        const names = placeholderCheck.names;
        const usedList = names.map((n) => `"${n}"`).join(", ");
        showLimitError(
          `Free plan supports 1 placeholder per snippet.\nThis snippet uses: ${usedList}.\nKeep one, or upgrade to use multiple placeholders.`
        );
        return;
      }
    }

    // 2) Free plan snippet count limit (only for new snippets, and only if not Pro)
    if (!editingId && !IS_PRO) {
      if (snippets.length >= FREE_SNIPPET_LIMIT) {
        showLimitError(
          `Free plan limit reached (${FREE_SNIPPET_LIMIT} snippets).\nDelete an existing snippet or upgrade to add more.`
        );
        return;
      }
    }

    const tags =
      tagsRaw.length > 0
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];

    const now = Date.now();

    if (editingId) {
      // Update existing
      const idx = snippets.findIndex((s) => s.id === editingId);
      if (idx !== -1) {
        snippets[idx] = {
          ...snippets[idx],
          title,
          category,
          tags,
          body,
          favorite,
          updatedAt: now,
        };
      }
    } else {
      // Create new
      const id = `psm_${now}_${Math.random().toString(36).slice(2, 8)}`;
      const newSnippet = {
        id,
        title,
        category,
        tags,
        body,
        favorite,
        createdAt: now,
        updatedAt: now,
      };
      snippets.unshift(newSnippet);
    }

    saveSnippetsToStorage().then(() => {
      clearForm();
      applyFilters();
      renderCategoryFilter();
      renderList();
    });
  });

  clearBtn.addEventListener("click", () => {
    clearForm();
  });

  // ====== Filters events ======

  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value.trim();
    applyFilters();
    renderList();
  });

  categoryFilterSelect.addEventListener("change", () => {
    currentCategoryFilter = categoryFilterSelect.value;
    applyFilters();
    renderList();
  });

  favoriteFilterInput.addEventListener("change", () => {
    favoritesOnly = favoriteFilterInput.checked;
    applyFilters();
    renderList();
  });

  // ====== Placeholder insertion button ======

  if (addPlaceholderBtn) {
    addPlaceholderBtn.addEventListener("click", () => {
      const name = window.prompt(
        "Enter a name for the placeholder (e.g. topic):",
        ""
      );
      if (!name) return;

      const placeholder = `{{${name}}}`;
      const textarea = bodyInput;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);
      textarea.value = before + placeholder + after;

      textarea.focus();
      const pos = before.length + placeholder.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    });
  }
});
