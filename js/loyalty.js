
import { db } from "./firebase.js";

import {
    getCustomers,
    normalizePhone
} from "./storage.js";

import {
    doc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const VISITS_REQUIRED = 5;

let customers = [];
let currentFilter = "all";
let searchTerm = "";
let selectedCustomerId = null;
let toastTimer = null;
let operationInProgress = false;

const elements = {
    summary: document.getElementById("loyaltySummary"),
    grid: document.getElementById("loyaltyGrid"),
    search: document.getElementById("loyaltySearch"),
    count: document.getElementById("loyaltyResultCount"),

    loyaltyModal: document.getElementById("loyaltyModal"),
    visitModal: document.getElementById("visitModal"),

    avatar: document.getElementById("loyaltyModalAvatar"),
    name: document.getElementById("loyaltyModalName"),
    phone: document.getElementById("loyaltyModalPhone"),
    status: document.getElementById("loyaltyRewardStatus"),
    stamps: document.getElementById("loyaltyModalStamps"),
    progress: document.getElementById("loyaltyModalProgress"),
    description: document.getElementById("loyaltyModalDescription"),
    visits: document.getElementById("loyaltyModalVisits"),
    earned: document.getElementById("loyaltyModalEarned"),
    redeemed: document.getElementById("loyaltyModalRedeemed"),

    redeemButton: document.getElementById("redeemRewardButton"),
    addVisitButton: document.getElementById("addVisitModalButton"),
    registerButton: document.getElementById("registerVisitButton"),

    visitSearch: document.getElementById("visitCustomerSearch"),
    visitResults: document.getElementById("visitCustomerResults"),

    closeLoyalty: document.getElementById("closeLoyaltyModal"),
    closeVisit: document.getElementById("closeVisitModal"),
    cancelVisit: document.getElementById("cancelVisitButton"),
    toast: document.getElementById("toast")
};

/* ==========================================
   UTILIDADES
========================================== */

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function getInitials(name) {
    return String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join("") || "?";
}

function showToast(message) {
    if (!elements.toast) {
        console.log(message);
        return;
    }

    elements.toast.textContent = message;
    elements.toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 3000);
}

function getCustomerById(id) {
    return customers.find(customer => customer.id === id);
}

function normalizeCount(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? Math.max(0, Math.floor(number))
        : 0;
}

/* ==========================================
   CÁLCULO DE FIDELIDAD
========================================== */

function getLoyaltyData(customer) {
    const visits = normalizeCount(customer.visits);
    const redeemed = normalizeCount(customer.rewardsRedeemed);

    const totalRewardsEarned = Math.floor(
        visits / VISITS_REQUIRED
    );

    const availableRewards = Math.max(
        0,
        totalRewardsEarned - redeemed
    );

    let progress = visits % VISITS_REQUIRED;

    if (availableRewards > 0 && progress === 0) {
        progress = VISITS_REQUIRED;
    }

    const remaining = progress === VISITS_REQUIRED
        ? 0
        : VISITS_REQUIRED - progress;

    return {
        visits,
        redeemed,
        totalRewardsEarned,
        availableRewards,
        progress,
        remaining
    };
}

function renderStamps(progress, large = false) {
    const className = large
        ? "loyalty-stamp"
        : "simple-loyalty-stamp";

    return Array.from(
        { length: VISITS_REQUIRED },
        (_, index) => `
            <span class="${className} ${
                index < progress ? "active" : ""
            }">✂</span>
        `
    ).join("");
}

/* ==========================================
   FIRESTORE
========================================== */

async function refreshCustomers() {
    const result = await getCustomers();

    customers = Array.isArray(result) ? result : [];

    renderAll();

    if (selectedCustomerId) {
        const selected = getCustomerById(selectedCustomerId);

        if (selected) {
            renderCustomerModal(selected);
        } else {
            closeLoyaltyModal();
        }
    }
}

/*
 * Las visitas se incrementan en una transacción.
 * Así evitamos perder incrementos si dos
 * administradores actualizan al mismo cliente.
 */
async function registerCustomerVisit(customerId) {
    if (operationInProgress) {
        return false;
    }

    const customer = getCustomerById(customerId);

    if (!customer) {
        showToast("No se encontró el cliente.");
        return false;
    }

    operationInProgress = true;
    updateOperationButtons();

    try {
        const customerRef = doc(
            db,
            "customers",
            customerId
        );

        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(customerRef);

            if (!snapshot.exists()) {
                throw new Error("El cliente ya no existe.");
            }

            const currentVisits = normalizeCount(
                snapshot.data().visits
            );

            transaction.update(customerRef, {
                visits: currentVisits + 1,
                updatedAt: new Date().toISOString()
            });
        });

        await refreshCustomers();

        showToast(
            `Visita registrada para ${customer.name}.`
        );

        return true;

    } catch (error) {
        console.error("Error registrando visita:", error);

        showToast(
            "No fue posible registrar la visita."
        );

        return false;

    } finally {
        operationInProgress = false;
        updateOperationButtons();
    }
}

/*
 * El canje también es transaccional.
 * Se vuelve a verificar el saldo dentro
 * de Firestore antes de descontar la recompensa.
 */
async function redeemSelectedReward() {
    if (!selectedCustomerId || operationInProgress) {
        return;
    }

    const customerId = selectedCustomerId;

    operationInProgress = true;
    updateOperationButtons();

    try {
        const customerRef = doc(
            db,
            "customers",
            customerId
        );

        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(customerRef);

            if (!snapshot.exists()) {
                throw new Error("El cliente ya no existe.");
            }

            const data = snapshot.data();

            const loyalty = getLoyaltyData(data);

            if (loyalty.availableRewards <= 0) {
                throw new Error(
                    "El cliente no tiene recompensas disponibles."
                );
            }

            transaction.update(customerRef, {
                rewardsRedeemed: loyalty.redeemed + 1,
                updatedAt: new Date().toISOString()
            });
        });

        await refreshCustomers();

        showToast("Recompensa canjeada correctamente.");

    } catch (error) {
        console.error("Error canjeando recompensa:", error);

        showToast(
            error.message ===
                "El cliente no tiene recompensas disponibles."
                ? error.message
                : "No fue posible canjear la recompensa."
        );

        try {
            await refreshCustomers();
        } catch (refreshError) {
            console.error(
                "Error actualizando clientes:",
                refreshError
            );
        }

    } finally {
        operationInProgress = false;
        updateOperationButtons();
    }
}

function updateOperationButtons() {
    if (elements.addVisitButton) {
        elements.addVisitButton.disabled = operationInProgress;
    }

    if (elements.redeemButton) {
        const customer = selectedCustomerId
            ? getCustomerById(selectedCustomerId)
            : null;

        elements.redeemButton.disabled =
            operationInProgress ||
            !customer ||
            getLoyaltyData(customer).availableRewards <= 0;
    }

    if (elements.visitResults) {
        elements.visitResults
            .querySelectorAll("[data-customer-id]")
            .forEach(button => {
                button.disabled = operationInProgress;
            });
    }
}

/* ==========================================
   ESTADÍSTICAS
========================================== */

function renderSummary() {
    const visits = customers.reduce(
        (total, customer) =>
            total + normalizeCount(customer.visits),
        0
    );

    const available = customers.reduce(
        (total, customer) =>
            total + getLoyaltyData(customer).availableRewards,
        0
    );

    const redeemed = customers.reduce(
        (total, customer) =>
            total + normalizeCount(customer.rewardsRedeemed),
        0
    );

    elements.summary.innerHTML = `
        <div class="module-summary-item">
            <strong>${customers.length}</strong>
            <span>Clientes</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${visits}</strong>
            <span>Visitas</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${available}</strong>
            <span>Recompensas disponibles</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${redeemed}</strong>
            <span>Canjeadas</span>
        </div>
    `;
}

/* ==========================================
   FILTROS Y BÚSQUEDA
========================================== */

function matchesSearch(customer) {
    if (!searchTerm) {
        return true;
    }

    const name = String(customer.name || "").toLowerCase();
    const phone = normalizePhone(customer.phone);
    const searchedPhone = normalizePhone(searchTerm);

    return (
        name.includes(searchTerm) ||
        (
            searchedPhone &&
            phone.includes(searchedPhone)
        )
    );
}

function matchesFilter(customer) {
    const availableRewards =
        getLoyaltyData(customer).availableRewards;

    if (currentFilter === "reward") {
        return availableRewards > 0;
    }

    if (currentFilter === "progress") {
        return availableRewards === 0;
    }

    return true;
}

function sortCustomers(a, b) {
    const rewardsA = getLoyaltyData(a).availableRewards;
    const rewardsB = getLoyaltyData(b).availableRewards;

    if (rewardsA !== rewardsB) {
        return rewardsB - rewardsA;
    }

    return normalizeCount(b.visits) -
        normalizeCount(a.visits);
}

/* ==========================================
   TARJETAS
========================================== */

function renderCustomers() {
    const filtered = customers
        .filter(matchesSearch)
        .filter(matchesFilter)
        .sort(sortCustomers);

    elements.count.textContent = `${
        filtered.length
    } ${
        filtered.length === 1 ? "cliente" : "clientes"
    }`;

    if (!filtered.length) {
        const message = customers.length
            ? "No encontramos clientes con estos filtros."
            : "Todavía no hay clientes registrados.";

        elements.grid.innerHTML = `
            <div class="module-empty-state">
                <div class="module-empty-icon">★</div>
                <strong>No hay resultados</strong>
                <p>${message}</p>
            </div>
        `;

        return;
    }

    elements.grid.innerHTML = filtered
        .map(createCustomerCard)
        .join("");
}

function createCustomerCard(customer) {
    const loyalty = getLoyaltyData(customer);
    const hasReward = loyalty.availableRewards > 0;

    return `
        <article class="unified-card">
            <div class="unified-card-header">
                <div class="unified-card-person">
                    <div class="unified-card-avatar">
                        ${escapeHTML(getInitials(customer.name))}
                    </div>

                    <div class="unified-card-title">
                        <h3>${escapeHTML(customer.name)}</h3>
                        <span>Cliente</span>
                    </div>
                </div>

                <div class="unified-status ${
                    hasReward ? "reward" : "progress"
                }">
                    <span></span>
                    ${
                        hasReward
                            ? "Recompensa"
                            : "En progreso"
                    }
                </div>
            </div>

            <div class="unified-card-metrics">
                <div>
                    <span>Visitas</span>
                    <strong>${loyalty.visits}</strong>
                </div>

                <div>
                    <span>Progreso</span>
                    <strong>
                        ${loyalty.progress}/${VISITS_REQUIRED}
                    </strong>
                </div>
            </div>

            <div class="unified-card-detail">
                <span>Fidelidad</span>

                <div class="simple-loyalty-stamps">
                    ${renderStamps(loyalty.progress)}
                </div>

                <small>
                    ${
                        hasReward
                            ? `${loyalty.availableRewards} ${
                                loyalty.availableRewards === 1
                                    ? "recompensa disponible"
                                    : "recompensas disponibles"
                            }`
                            : `Faltan ${loyalty.remaining} visitas`
                    }
                </small>
            </div>

            <div class="unified-card-footer">
                <span>
                    ${escapeHTML(
                        customer.phone || "Sin teléfono"
                    )}
                </span>

                <button
                    type="button"
                    class="modern-edit-button"
                    data-action="view"
                    data-id="${escapeHTML(customer.id)}"
                >
                    Ver cliente
                    <span>→</span>
                </button>
            </div>
        </article>
    `;
}

function renderAll() {
    renderSummary();
    renderCustomers();
}

/* ==========================================
   MODAL DE CLIENTE
========================================== */

function openCustomerLoyalty(customerId) {
    const customer = getCustomerById(customerId);

    if (!customer) {
        showToast("No se encontró el cliente.");
        return;
    }

    selectedCustomerId = customer.id;

    renderCustomerModal(customer);

    elements.loyaltyModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function renderCustomerModal(customer) {
    const loyalty = getLoyaltyData(customer);

    elements.avatar.textContent = getInitials(customer.name);
    elements.name.textContent = customer.name;
    elements.phone.textContent =
        customer.phone || "Sin teléfono";

    elements.visits.textContent = loyalty.visits;
    elements.earned.textContent =
        loyalty.totalRewardsEarned;
    elements.redeemed.textContent = loyalty.redeemed;

    elements.stamps.innerHTML = renderStamps(
        loyalty.progress,
        true
    );

    elements.progress.style.width = `${
        (loyalty.progress / VISITS_REQUIRED) * 100
    }%`;

    if (loyalty.availableRewards > 0) {
        elements.status.className =
            "unified-status reward";

        elements.status.innerHTML =
            "<span></span> Recompensa";

        elements.description.textContent =
            loyalty.availableRewards === 1
                ? "El cliente tiene una recompensa disponible."
                : `El cliente tiene ${loyalty.availableRewards} recompensas disponibles.`;

    } else {
        elements.status.className =
            "unified-status progress";

        elements.status.innerHTML =
            "<span></span> En progreso";

        elements.description.textContent =
            `${loyalty.progress}/${VISITS_REQUIRED} visitas · ` +
            `Faltan ${loyalty.remaining}.`;
    }

    updateOperationButtons();
}

function closeLoyaltyModal() {
    elements.loyaltyModal.classList.add("hidden");
    selectedCustomerId = null;
    unlockBody();
}

async function registerSelectedCustomerVisit() {
    if (!selectedCustomerId) {
        return;
    }

    await registerCustomerVisit(selectedCustomerId);
}

/* ==========================================
   MODAL PARA REGISTRAR VISITA
========================================== */

function openVisitModal() {
    elements.visitSearch.value = "";

    renderVisitCustomerResults();

    elements.visitModal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    elements.visitSearch.focus();
}

function closeVisitModal() {
    elements.visitModal.classList.add("hidden");
    unlockBody();
}

function renderVisitCustomerResults() {
    const search = elements.visitSearch.value
        .trim()
        .toLowerCase();

    const normalized = normalizePhone(search);

    const filtered = customers
        .filter(customer => {
            if (!search) {
                return true;
            }

            return (
                String(customer.name || "")
                    .toLowerCase()
                    .includes(search) ||
                (
                    normalized &&
                    normalizePhone(customer.phone)
                        .includes(normalized)
                )
            );
        })
        .slice(0, 6);

    if (!filtered.length) {
        elements.visitResults.innerHTML = `
            <div class="simple-result-empty">
                No se encontraron clientes.
            </div>
        `;

        return;
    }

    elements.visitResults.innerHTML = filtered
        .map(customer => {
            const loyalty = getLoyaltyData(customer);

            return `
                <button
                    type="button"
                    class="simple-customer-result"
                    data-customer-id="${escapeHTML(customer.id)}"
                    ${operationInProgress ? "disabled" : ""}
                >
                    <div class="simple-result-avatar">
                        ${escapeHTML(
                            getInitials(customer.name)
                        )}
                    </div>

                    <div>
                        <strong>
                            ${escapeHTML(customer.name)}
                        </strong>

                        <span>
                            ${escapeHTML(
                                customer.phone || "Sin teléfono"
                            )}
                        </span>
                    </div>

                    <small>
                        ${loyalty.progress}/${VISITS_REQUIRED}
                    </small>
                </button>
            `;
        })
        .join("");
}

async function handleVisitCustomerResult(event) {
    const button = event.target.closest(
        "[data-customer-id]"
    );

    if (!button || operationInProgress) {
        return;
    }

    const success = await registerCustomerVisit(
        button.dataset.customerId
    );

    if (success) {
        closeVisitModal();
    }
}

/* ==========================================
   MODALES
========================================== */

function unlockBody() {
    if (
        elements.loyaltyModal.classList.contains("hidden") &&
        elements.visitModal.classList.contains("hidden")
    ) {
        document.body.classList.remove("modal-open");
    }
}

/* ==========================================
   EVENTOS
========================================== */

function configureEvents() {
    elements.search.addEventListener("input", event => {
        searchTerm = event.target.value
            .trim()
            .toLowerCase();

        renderCustomers();
    });

    document.querySelectorAll(
        ".module-filters .filter"
    ).forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(
                ".module-filters .filter"
            ).forEach(item => {
                item.classList.remove("active");
            });

            button.classList.add("active");

            currentFilter = button.dataset.filter || "all";

            renderCustomers();
        });
    });

    elements.grid.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");

        if (button?.dataset.action === "view") {
            openCustomerLoyalty(button.dataset.id);
        }
    });

    elements.registerButton.addEventListener(
        "click",
        openVisitModal
    );

    elements.closeLoyalty.addEventListener(
        "click",
        closeLoyaltyModal
    );

    elements.closeVisit.addEventListener(
        "click",
        closeVisitModal
    );

    elements.cancelVisit.addEventListener(
        "click",
        closeVisitModal
    );

    elements.addVisitButton.addEventListener(
        "click",
        registerSelectedCustomerVisit
    );

    elements.redeemButton.addEventListener(
        "click",
        redeemSelectedReward
    );

    elements.visitSearch.addEventListener(
        "input",
        renderVisitCustomerResults
    );

    elements.visitResults.addEventListener(
        "click",
        handleVisitCustomerResult
    );

    elements.loyaltyModal.addEventListener(
        "click",
        event => {
            if (event.target === elements.loyaltyModal) {
                closeLoyaltyModal();
            }
        }
    );

    elements.visitModal.addEventListener(
        "click",
        event => {
            if (event.target === elements.visitModal) {
                closeVisitModal();
            }
        }
    );

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        if (
            !elements.visitModal.classList.contains("hidden")
        ) {
            closeVisitModal();
            return;
        }

        if (
            !elements.loyaltyModal.classList.contains("hidden")
        ) {
            closeLoyaltyModal();
        }
    });
}

/* ==========================================
   INICIALIZACIÓN
========================================== */

async function initialize() {
    const missingElements = Object.entries(elements)
        .filter(([, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length) {
        console.error(
            "Faltan elementos HTML en Fidelidad:",
            missingElements
        );
        return;
    }

    configureEvents();

    elements.grid.innerHTML = `
        <div class="module-empty-state">
            <p>Cargando clientes desde Firebase...</p>
        </div>
    `;

    try {
        await refreshCustomers();

    } catch (error) {
        console.error(
            "Error cargando Fidelidad:",
            error
        );

        elements.grid.innerHTML = `
            <div class="module-empty-state">
                <strong>
                    No fue posible cargar los clientes.
                </strong>
                <p>
                    Revisa la conexión y los permisos de Firebase.
                </p>
            </div>
        `;

        showToast(
            "No fue posible cargar Fidelidad desde Firebase."
        );
    }
}

initialize();
