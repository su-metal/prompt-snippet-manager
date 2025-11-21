// storage key
const STORAGE_KEY = "promptSnippets";

document.addEventListener("DOMContentLoaded", () => {
  const titleInput = document.getElementById("title");
  const categoryInput = document.getElementById("category");
  const tagsInput = document.getElementById("tags");
  const favoriteInput = document.getElementById("favorite");
  const bodyInput = document.getElementById("body");
  const editingIdInput = document.getElementById("editingId");

  const saveBtn = document.getElementById("saveBtn");
  const clearBtn = document.getElementById("clearBtn");

  const searchInput = document.getElementById("search");
  const categoryFilter = document.getElementById("categoryFilter");
  const favoriteFilter = document.getElementById("favoriteFilter");
  const listEl = document.getElementById("snippetList");
  const itemTemplate = document.getElementById("snippetItemTemplate");

  let snippets = [];

  function loadSnippets() {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      snippets = result[STORAGE_KEY] || [];
      renderCategoryFilter();
      renderList();
    });
  }

  function saveSnippets() {
    chrome.storage.sync.set({ [STORAGE_KEY]: snippets });
  }

  function clearEditor() {
    titleInput.value = "";
    categoryInput.value = "";
    tagsInput.value = "";
    favoriteInput.checked = false;
    bodyInput.value = "";
    editingIdInput.value = "";
  }

  function handleSave() {
    const title = titleInput.value.trim();
    const category = categoryInput.value.trim();
    const tagsText = tagsInput.value.trim();
    const body = bodyInput.value.trim();
    const favorite = favoriteInput.checked;

    if (!title || !body) {
      alert("Title and body are required.");
      return;
    }

    const tags = tagsText
      ? tagsText.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const editingId = editingIdInput.value;

    if (editingId) {
      // update existing
      const idx = snippets.findIndex((s) => s.id === editingId);
      if (idx !== -1) {
        snippets[idx] = {
          ...snippets[idx],
          title,
          category,
          tags,
          body,
          favorite
        };
      }
    } else {
      // create new
      const id = `snippet-${Date.now()}`;
      snippets.push({ id, title, category, tags, body, favorite });
    }

    saveSnippets();
    renderCategoryFilter();
    renderList();
    clearEditor();
  }

  function handleDelete(id) {
    if (!confirm("Delete this snippet?")) return;
    snippets = snippets.filter((s) => s.id !== id);
    saveSnippets();
    renderCategoryFilter();
    renderList();
  }

  function handleEdit(id) {
    const snippet = snippets.find((s) => s.id === id);
    if (!snippet) return;

    editingIdInput.value = snippet.id;
    titleInput.value = snippet.title;
    categoryInput.value = snippet.category || "";
    tagsInput.value = snippet.tags ? snippet.tags.join(", ") : "";
    favoriteInput.checked = !!snippet.favorite;
    bodyInput.value = snippet.body;
  }

  function renderCategoryFilter() {
    const categories = Array.from(
      new Set(
        snippets
          .map((s) => s.category && s.category.trim())
          .filter(Boolean)
      )
    ).sort();

    const current = categoryFilter.value;
    categoryFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All categories";
    categoryFilter.appendChild(allOption);

    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    });

    if (categories.includes(current)) {
      categoryFilter.value = current;
    }
  }

  function matchesFilter(snippet) {
    const search = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;
    const favOnly = favoriteFilter.checked;

    if (cat && snippet.category !== cat) return false;
    if (favOnly && !snippet.favorite) return false;

    if (search) {
      const hay = [
        snippet.title,
        snippet.category,
        snippet.body,
        ...(snippet.tags || [])
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }

    return true;
  }

  function renderList() {
    listEl.innerHTML = "";

    const filtered = snippets.filter(matchesFilter);

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No snippets yet.";
      empty.style.fontSize = "0.8rem";
      empty.style.color = "#6b7280";
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach((snippet) => {
      const node = itemTemplate.content.cloneNode(true);
      const li = node.querySelector(".snippet-item");
      const titleEl = node.querySelector(".snippet-title");
      const catEl = node.querySelector(".snippet-category");
      const tagsEl = node.querySelector(".snippet-tags");
      const editBtn = node.querySelector(".edit-btn");
      const deleteBtn = node.querySelector(".delete-btn");

      titleEl.textContent = snippet.title;
      if (snippet.favorite) {
        titleEl.textContent += " ★";
      }

      if (snippet.category) {
        catEl.textContent = snippet.category;
      } else {
        catEl.style.display = "none";
      }

      if (snippet.tags && snippet.tags.length > 0) {
        tagsEl.textContent = snippet.tags.map((t) => `#${t}`).join(" ");
      } else {
        tagsEl.style.display = "none";
      }

      editBtn.addEventListener("click", () => handleEdit(snippet.id));
      deleteBtn.addEventListener("click", () => handleDelete(snippet.id));

      listEl.appendChild(li);
    });
  }

  saveBtn.addEventListener("click", handleSave);
  clearBtn.addEventListener("click", clearEditor);

  searchInput.addEventListener("input", renderList);
  categoryFilter.addEventListener("change", renderList);
  favoriteFilter.addEventListener("change", renderList);

  loadSnippets();
});
