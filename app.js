
"use strict";

// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://xxqqvytzteekuccdqjsp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_sgt91Q6efjlHrv9q15phMw_eIZqTLCx";

const configValida =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_URL.endsWith(".supabase.co") &&
  !SUPABASE_URL.includes("PEGAR_AQUI") &&
  SUPABASE_PUBLISHABLE_KEY.length > 0 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("sb_publishable_");

const db = configValida
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const $ = (id) => document.getElementById(id);

const money = (n) => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS"
}).format(Number(n) || 0);

const dateTime = (value) => new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short"
}).format(new Date(value));

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[c]);

let currentUser = null;
let products = [];
let movements = [];
let deleteTarget = null;
let busy = false;
let isRecoveryFlow = false;

// MENSAJES Y ESTADO DE LA INTERFAZ

function message(id, text = "", success = false) {
  const el = $(id);
  if (!el) return;

  el.textContent = text;
  el.style.color = success ? "#18794e" : "#b42318";
}

function setBusy(value) {
  busy = value;

  document.querySelectorAll("button").forEach(button => {
    if (button.id !== "logout-btn") {
      button.disabled = value;
    }
  });
}

function showApp(signedIn) {
  $("auth-screen").classList.toggle("hidden", signedIn);
  $("app-screen").classList.toggle("hidden", !signedIn);
}

function showAuthPanel(panelId) {
  ["auth-form", "recovery-form", "reset-form"].forEach(id => {
    const panel = $(id);
    if (panel) panel.classList.toggle("hidden", id !== panelId);
  });

  showApp(false);
}

// INVENTARIO

function statusOf(product) {
  if (Number(product.stock) === 0) return ["Sin stock", "out"];
  if (Number(product.stock) <= Number(product.min_stock)) {
    return ["Stock bajo", "low"];
  }
  return ["Disponible", "ok"];
}

function stockPill(product) {
  const [label, style] = statusOf(product);
  return `<span class="pill ${style}">${label}</span>`;
}

function switchView(view) {
  const validViews = ["dashboard", "products", "movements"];
  if (!validViews.includes(view)) return;

  document.querySelectorAll(".view").forEach(el => {
    el.classList.add("hidden");
  });

  $(`${view}-view`).classList.remove("hidden");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  $("page-title").textContent = ({
    dashboard: "Resumen general",
    products: "Gestión de productos",
    movements: "Movimientos de stock"
  })[view];
}

async function loadData() {
  if (!db || !currentUser) return;

  setBusy(true);
  message("global-message");

  try {
    const [pResult, mResult] = await Promise.all([
      db.from("products")
        .select("*")
        .order("name"),

      db.from("stock_movements")
        .select(
          "id, product_id, movement_type, quantity, previous_stock, new_stock, notes, created_at, products(name, code)"
        )
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    if (pResult.error) throw pResult.error;
    if (mResult.error) throw mResult.error;

    products = pResult.data || [];
    movements = mResult.data || [];

    renderAll();
  } catch (error) {
    message("global-message", "No se pudieron cargar los datos: " + error.message);
  } finally {
    setBusy(false);
  }
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderMovementHistory();
  renderProductSelect();
  renderCategoryFilter();
}

function renderDashboard() {
  const units = products.reduce((sum, p) => sum + Number(p.stock), 0);
  const low = products.filter(
    p => Number(p.stock) <= Number(p.min_stock)
  ).length;
  const value = products.reduce(
    (sum, p) => sum + Number(p.price) * Number(p.stock), 0
  );

  $("stat-products").textContent = products.length;
  $("stat-units").textContent = units.toLocaleString("es-AR");
  $("stat-low").textContent = low;
  $("stat-value").textContent = money(value);

  const lowProducts = products
    .filter(p => Number(p.stock) <= Number(p.min_stock))
    .sort((a, b) => Number(a.stock) - Number(b.stock))
    .slice(0, 6);

  $("low-stock-list").innerHTML = lowProducts.length
    ? lowProducts.map(p => `
      <div class="mini-row">
        <div>
          <strong>${escapeHTML(p.name)}</strong>
          <small>${escapeHTML(p.code)} · Mínimo: ${p.min_stock}</small>
        </div>
        <div>${stockPill(p)} <strong>${p.stock} u.</strong></div>
      </div>`).join("")
    : '<p class="empty-state">No hay productos con stock bajo.</p>';

  $("recent-movements").innerHTML = movements.slice(0, 5).map(m => `
    <div class="mini-row">
      <div>
        <strong>${escapeHTML(m.products?.name || "Producto eliminado")}</strong>
        <small>${dateTime(m.created_at)}</small>
      </div>
      <div class="${m.movement_type === "entrada" ? "movement-in" : "movement-out"}">
        ${m.movement_type === "entrada" ? "+" : "−"}${m.quantity} u.
      </div>
    </div>`).join("") ||
    '<p class="empty-state">Todavía no hay movimientos.</p>';
}

function renderProducts() {
  const query = $("search-products").value.trim().toLocaleLowerCase("es");
  const category = $("category-filter").value;

  const filtered = products.filter(p => {
    const text = `${p.name} ${p.code} ${p.category}`.toLocaleLowerCase("es");
    return text.includes(query) && (!category || p.category === category);
  });

  $("product-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "producto" : "productos"}`;

  $("products-table").innerHTML = filtered.map(p => `
    <tr>
      <td>${escapeHTML(p.code)}</td>
      <td>
        <span class="product-name">${escapeHTML(p.name)}</span>
        ${p.description
          ? `<small class="product-description">${escapeHTML(p.description)}</small>`
          : ""}
      </td>
      <td>${escapeHTML(p.category)}</td>
      <td>${money(p.price)}</td>
      <td><strong>${p.stock}</strong></td>
      <td>${stockPill(p)}</td>
      <td>
        <div class="table-actions">
          <button data-edit="${p.id}">Editar</button>
          <button class="delete-btn" data-delete="${p.id}">Eliminar</button>
        </div>
      </td>
    </tr>`).join("");

  $("products-empty").classList.toggle("hidden", filtered.length > 0);
}

function renderCategoryFilter() {
  const select = $("category-filter");
  const oldValue = select.value;
  const categories = [...new Set(products.map(p => p.category))].sort();

  select.innerHTML =
    '<option value="">Todas las categorías</option>' +
    categories.map(c =>
      `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`
    ).join("");

  if (categories.includes(oldValue)) select.value = oldValue;
}

function renderProductSelect() {
  const select = $("movement-product");
  const previous = select.value;

  select.innerHTML =
    '<option value="">Seleccionar producto</option>' +
    products.map(p =>
      `<option value="${p.id}">${escapeHTML(p.code)} — ${escapeHTML(p.name)} (stock: ${p.stock})</option>`
    ).join("");

  if (products.some(p => p.id === previous)) select.value = previous;
}

function renderMovementHistory() {
  $("movements-table").innerHTML = movements.map(m => `
    <tr>
      <td>${dateTime(m.created_at)}</td>
      <td>${escapeHTML(m.products?.name || "Producto eliminado")}</td>
      <td>
        <span class="${m.movement_type === "entrada" ? "movement-in" : "movement-out"}">
          ${m.movement_type === "entrada" ? "Entrada" : "Salida"}
        </span>
      </td>
      <td>${m.quantity}</td>
      <td>${m.previous_stock}</td>
      <td>${m.new_stock}</td>
      <td>${escapeHTML(m.notes || "—")}</td>
    </tr>`).join("");

  $("movements-empty").classList.toggle("hidden", movements.length > 0);
}

// ALTA Y EDICIÓN DE PRODUCTOS

function openProductForm(product = null) {
  $("product-form").reset();
  $("product-id").value = product?.id || "";
  $("product-form-title").textContent = product ? "Editar producto" : "Nuevo producto";
  $("product-code").value = product?.code || "";
  $("product-name").value = product?.name || "";
  $("product-category").value = product?.category || "General";
  $("product-price").value = product?.price ?? 0;
  $("product-stock").value = product?.stock ?? 0;
  $("product-min-stock").value = product?.min_stock ?? 5;
  $("product-description").value = product?.description || "";

  $("product-stock").disabled = Boolean(product);
  $("product-stock").title = product
    ? "Usá el formulario de movimientos para modificar el stock."
    : "Stock inicial del producto.";

  $("product-form-panel").classList.remove("hidden");
  $("product-form-panel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function closeProductForm() {
  $("product-form-panel").classList.add("hidden");
  $("product-form").reset();
  $("product-stock").disabled = false;
}

async function saveProduct(event) {
  event.preventDefault();
  if (busy || !currentUser) return;

  const id = $("product-id").value;
  const price = Number($("product-price").value);
  const stock = Number($("product-stock").value);
  const minStock = Number($("product-min-stock").value);

  if (!Number.isFinite(price) || price < 0 ||
      !Number.isInteger(stock) || stock < 0 ||
      !Number.isInteger(minStock) || minStock < 0) {
    message("global-message", "Revisá el precio y las cantidades ingresadas.");
    return;
  }

  const payload = {
    user_id: currentUser.id,
    code: $("product-code").value.trim(),
    name: $("product-name").value.trim(),
    category: $("product-category").value.trim() || "General",
    description: $("product-description").value.trim(),
    price,
    min_stock: minStock
  };

  if (!payload.code || !payload.name || !payload.category) {
    message("global-message", "Completá los campos obligatorios.");
    return;
  }

  setBusy(true);

  try {
    let result;

    if (id) {
      result = await db.from("products").update({
        code: payload.code,
        name: payload.name,
        category: payload.category,
        description: payload.description,
        price: payload.price,
        min_stock: payload.min_stock,
        updated_at: new Date().toISOString()
      }).eq("id", id).select("id");
    } else {
      result = await db.from("products")
        .insert({ ...payload, stock })
        .select("id");
    }

    if (result.error) throw result.error;
    if (!result.data?.length) {
      throw new Error("No se guardaron cambios. Verificá tus permisos.");
    }

    closeProductForm();
    message("global-message", "Producto guardado correctamente.", true);
    await loadData();
  } catch (error) {
    message("global-message", "No se pudo guardar: " + error.message);
  } finally {
    setBusy(false);
  }
}

// ELIMINACIÓN DE PRODUCTOS

function askDelete(id) {
  deleteTarget = id;
  $("confirm-dialog").classList.remove("hidden");
}

async function deleteProduct() {
  if (busy || !deleteTarget) return;

  setBusy(true);

  try {
    const result = await db.from("products")
      .delete()
      .eq("id", deleteTarget)
      .select("id");

    if (result.error) throw result.error;
    if (!result.data?.length) {
      throw new Error("No se pudo eliminar el producto.");
    }

    $("confirm-dialog").classList.add("hidden");
    deleteTarget = null;
    message("global-message", "Producto eliminado.", true);
    await loadData();
  } catch (error) {
    message("global-message", "Error al eliminar: " + error.message);
  } finally {
    setBusy(false);
  }
}

// MOVIMIENTOS DE STOCK

async function saveMovement(event) {
  event.preventDefault();
  if (busy || !currentUser) return;

  const productId = $("movement-product").value;
  const type = $("movement-type").value;
  const quantity = Number($("movement-quantity").value);
  const notes = $("movement-notes").value.trim();

  if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
    message(
      "global-message",
      "Seleccioná un producto y una cantidad entera mayor que cero."
    );
    return;
  }

  setBusy(true);

  try {
    const result = await db.rpc("register_stock_movement", {
      p_product_id: productId,
      p_type: type,
      p_quantity: quantity,
      p_notes: notes
    });

    if (result.error) throw result.error;

    $("movement-form").reset();
    message("global-message", "Movimiento registrado correctamente.", true);
    await loadData();
  } catch (error) {
    message("global-message", "No se pudo registrar el movimiento: " + error.message);
  } finally {
    setBusy(false);
  }
}

// AUTENTICACIÓN

async function signIn(event) {
  event.preventDefault();

  if (!db) {
    message("auth-message", "Revisá la URL y la clave pública de Supabase en app.js.");
    return;
  }

  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  setBusy(true);
  message("auth-message");

  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (error) {
    message("auth-message", "No se pudo iniciar sesión: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function signUp() {
  if (!db) {
    message("auth-message", "Revisá la URL y la clave pública de Supabase en app.js.");
    return;
  }

  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  if (!email || password.length < 6) {
    message(
      "auth-message",
      "Ingresá un correo válido y una contraseña de al menos 6 caracteres."
    );
    return;
  }

  setBusy(true);
  message("auth-message");

  try {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;

    message(
      "auth-message",
      data.session
        ? "Cuenta creada. Ya podés comenzar."
        : "Cuenta solicitada. Revisá tu correo para confirmar el registro.",
      true
    );
  } catch (error) {
    message("auth-message", "No se pudo crear la cuenta: " + error.message);
  } finally {
    setBusy(false);
  }
}

// RECUPERACIÓN DE CONTRASEÑA

async function sendPasswordRecovery(event) {
  event.preventDefault();

  if (!db) {
    message("recovery-message", "La configuración de Supabase no es válida.");
    return;
  }

  const email = $("recovery-email").value.trim();

  if (!email) {
    message("recovery-message", "Ingresá tu correo electrónico.");
    return;
  }

  setBusy(true);
  message("recovery-message");

  try {
    const redirectTo = window.location.origin + window.location.pathname;

    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) throw error;

    message(
      "recovery-message",
      "Si el correo está registrado, recibirás un enlace. Revisá también Spam.",
      true
    );
  } catch (error) {
    message("recovery-message", "No se pudo enviar el correo: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function resetPassword(event) {
  event.preventDefault();

  if (!db) {
    message("reset-message", "La configuración de Supabase no es válida.");
    return;
  }

  const password = $("new-password").value;
  const confirmation = $("confirm-new-password").value;

  if (password.length < 6) {
    message("reset-message", "La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  if (password !== confirmation) {
    message("reset-message", "Las contraseñas no coinciden.");
    return;
  }

  setBusy(true);
  message("reset-message");

  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;

    isRecoveryFlow = false;

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search
    );

    const { error: signOutError } = await db.auth.signOut();
    if (signOutError) throw signOutError;

    $("auth-password").value = "";
    $("new-password").value = "";
    $("confirm-new-password").value = "";

    showAuthPanel("auth-form");

    message(
      "auth-message",
      "Contraseña actualizada. Ya podés iniciar sesión con la nueva.",
      true
    );
  } catch (error) {
    message("reset-message", "No se pudo cambiar la contraseña: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function signOut() {
  if (!db) return;

  const { error } = await db.auth.signOut();
  if (error) message("global-message", error.message);
}

// EVENTOS

function bindEvents() {
  $("auth-form").addEventListener("submit", signIn);
  $("signup-btn").addEventListener("click", signUp);
  $("logout-btn").addEventListener("click", signOut);

  $("forgot-password-btn").addEventListener("click", () => {
    $("recovery-email").value = $("auth-email").value.trim();
    message("recovery-message");
    showAuthPanel("recovery-form");
  });

  $("back-to-login").addEventListener("click", () => {
    showAuthPanel("auth-form");
  });

  $("recovery-form").addEventListener("submit", sendPasswordRecovery);
  $("reset-form").addEventListener("submit", resetPassword);

  $("product-form").addEventListener("submit", saveProduct);
  $("movement-form").addEventListener("submit", saveMovement);

  $("new-product-btn").addEventListener("click", () => openProductForm());

  $("new-product-top").addEventListener("click", () => {
    switchView("products");
    openProductForm();
  });

  $("cancel-product").addEventListener("click", closeProductForm);

  $("cancel-delete").addEventListener("click", () => {
    deleteTarget = null;
    $("confirm-dialog").classList.add("hidden");
  });

  $("confirm-delete").addEventListener("click", deleteProduct);

  $("search-products").addEventListener("input", renderProducts);
  $("category-filter").addEventListener("change", renderProducts);

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.go));
  });

  $("products-table").addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      const product = products.find(p => p.id === editButton.dataset.edit);
      if (product) openProductForm(product);
    }

    if (deleteButton) {
      askDelete(deleteButton.dataset.delete);
    }
  });
}

// INICIALIZACIÓN

async function init() {
  bindEvents();

  if (!db) {
    message(
      "auth-message",
      "Configuración pendiente: revisá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en app.js."
    );
    return;
  }

  // Los enlaces de recuperación de Supabase regresan con type=recovery en el hash.
  isRecoveryFlow = window.location.hash.includes("type=recovery");

  // Escuchamos primero los cambios de autenticación para no perder el evento
  // de recuperación de contraseña durante la carga inicial.
  db.auth.onAuthStateChange((event, session) => {
    if (
      event === "PASSWORD_RECOVERY" ||
      (isRecoveryFlow && event === "INITIAL_SESSION")
    ) {
      isRecoveryFlow = true;
      showAuthPanel("reset-form");
      return;
    }

    currentUser = session?.user || null;
    showApp(Boolean(currentUser));

    if (currentUser) {
      $("user-email").textContent = currentUser.email || "Usuario";
      setTimeout(() => loadData(), 0);
    } else {
      products = [];
      movements = [];
      $("user-email").textContent = "";
      renderAll();
    }
  });

  const { data: { session }, error } = await db.auth.getSession();

  if (error) {
    message("auth-message", "No se pudo verificar la sesión: " + error.message);
    return;
  }

  currentUser = session?.user || null;

  if (isRecoveryFlow) {
    showAuthPanel("reset-form");
    return;
  }

  showApp(Boolean(currentUser));

  if (currentUser) {
    $("user-email").textContent = currentUser.email || "Usuario";
    await loadData();
  }
}

document.addEventListener("DOMContentLoaded", init);
