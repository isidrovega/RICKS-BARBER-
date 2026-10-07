import {
    getCustomers,
    saveCustomers,
    normalizePhone
} from "./storage.js";


const VISITS_REQUIRED = 5;

let currentFilter = "all";
let searchTerm = "";
let selectedCustomerId = null;
let toastTimer = null;


const loyaltySummary =
    document.getElementById("loyaltySummary");

const loyaltyGrid =
    document.getElementById("loyaltyGrid");

const loyaltySearch =
    document.getElementById("loyaltySearch");

const loyaltyResultCount =
    document.getElementById("loyaltyResultCount");

const loyaltyModal =
    document.getElementById("loyaltyModal");

const visitModal =
    document.getElementById("visitModal");

const loyaltyModalAvatar =
    document.getElementById("loyaltyModalAvatar");

const loyaltyModalName =
    document.getElementById("loyaltyModalName");

const loyaltyModalPhone =
    document.getElementById("loyaltyModalPhone");

const loyaltyRewardStatus =
    document.getElementById("loyaltyRewardStatus");

const loyaltyModalStamps =
    document.getElementById("loyaltyModalStamps");

const loyaltyModalProgress =
    document.getElementById("loyaltyModalProgress");

const loyaltyModalDescription =
    document.getElementById("loyaltyModalDescription");

const loyaltyModalVisits =
    document.getElementById("loyaltyModalVisits");

const loyaltyModalEarned =
    document.getElementById("loyaltyModalEarned");

const loyaltyModalRedeemed =
    document.getElementById("loyaltyModalRedeemed");

const redeemRewardButton =
    document.getElementById("redeemRewardButton");

const addVisitModalButton =
    document.getElementById("addVisitModalButton");

const registerVisitButton =
    document.getElementById("registerVisitButton");

const visitCustomerSearch =
    document.getElementById("visitCustomerSearch");

const visitCustomerResults =
    document.getElementById("visitCustomerResults");


function initialize() {
    migrateCustomers();
    configureEvents();
    renderAll();
}


function migrateCustomers() {
    const customers =
        getCustomers();

    let changed = false;

    const migrated =
        customers.map(customer => {
            const next = {
                ...customer
            };

            if (
                typeof next.rewardsRedeemed !==
                "number"
            ) {
                next.rewardsRedeemed = 0;
                changed = true;
            }

            return next;
        });

    if (changed) {
        saveCustomers(migrated);
    }
}


function configureEvents() {
    loyaltySearch.addEventListener(
        "input",
        event => {
            searchTerm =
                event.target.value
                    .trim()
                    .toLowerCase();

            renderCustomers();
        }
    );


    document
        .querySelectorAll(
            ".module-filters .filter"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    document
                        .querySelectorAll(
                            ".module-filters .filter"
                        )
                        .forEach(item => {
                            item.classList.remove(
                                "active"
                            );
                        });

                    button.classList.add(
                        "active"
                    );

                    currentFilter =
                        button.dataset.filter;

                    renderCustomers();
                }
            );
        });


    loyaltyGrid.addEventListener(
        "click",
        handleGridAction
    );


    registerVisitButton.addEventListener(
        "click",
        openVisitModal
    );


    document
        .getElementById(
            "closeLoyaltyModal"
        )
        .addEventListener(
            "click",
            closeLoyaltyModal
        );


    document
        .getElementById(
            "closeVisitModal"
        )
        .addEventListener(
            "click",
            closeVisitModal
        );


    document
        .getElementById(
            "cancelVisitButton"
        )
        .addEventListener(
            "click",
            closeVisitModal
        );


    addVisitModalButton.addEventListener(
        "click",
        registerSelectedCustomerVisit
    );


    redeemRewardButton.addEventListener(
        "click",
        redeemSelectedReward
    );


    visitCustomerSearch.addEventListener(
        "input",
        renderVisitCustomerResults
    );


    visitCustomerResults.addEventListener(
        "click",
        handleVisitCustomerResult
    );


    loyaltyModal.addEventListener(
        "click",
        event => {
            if (event.target === loyaltyModal) {
                closeLoyaltyModal();
            }
        }
    );


    visitModal.addEventListener(
        "click",
        event => {
            if (event.target === visitModal) {
                closeVisitModal();
            }
        }
    );


    document.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            if (
                !visitModal.classList.contains(
                    "hidden"
                )
            ) {
                closeVisitModal();
                return;
            }

            if (
                !loyaltyModal.classList.contains(
                    "hidden"
                )
            ) {
                closeLoyaltyModal();
            }
        }
    );
}


function renderAll() {
    renderSummary();
    renderCustomers();
}


function renderSummary() {
    const customers =
        getCustomers();

    const visits =
        customers.reduce(
            (total, customer) =>
                total +
                Number(customer.visits || 0),
            0
        );

    const available =
        customers.reduce(
            (total, customer) =>
                total +
                getLoyaltyData(
                    customer
                ).availableRewards,
            0
        );

    const redeemed =
        customers.reduce(
            (total, customer) =>
                total +
                Number(
                    customer.rewardsRedeemed ||
                    0
                ),
            0
        );

    loyaltySummary.innerHTML = `
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


function renderCustomers() {
    const customers =
        getCustomers()
            .filter(matchesSearch)
            .filter(matchesFilter)
            .sort(sortCustomers);

    loyaltyResultCount.textContent =
        `${customers.length} ${
            customers.length === 1
                ? "cliente"
                : "clientes"
        }`;

    if (!customers.length) {
        loyaltyGrid.innerHTML = `
            <div class="module-empty-state">

                <div class="module-empty-icon">
                    ★
                </div>

                <strong>
                    No hay resultados
                </strong>

                <p>
                    No encontramos clientes con estos filtros.
                </p>

            </div>
        `;

        return;
    }

    loyaltyGrid.innerHTML =
        customers
            .map(createCustomerCard)
            .join("");
}


function matchesSearch(customer) {
    if (!searchTerm) {
        return true;
    }

    const name =
        String(customer.name || "")
            .toLowerCase();

    const phone =
        normalizePhone(
            customer.phone || ""
        );

    const searchedPhone =
        normalizePhone(searchTerm);

    return (
        name.includes(searchTerm) ||
        (
            searchedPhone &&
            phone.includes(searchedPhone)
        )
    );
}


function matchesFilter(customer) {
    const rewards =
        getLoyaltyData(
            customer
        ).availableRewards;

    if (currentFilter === "reward") {
        return rewards > 0;
    }

    if (currentFilter === "progress") {
        return rewards === 0;
    }

    return true;
}


function sortCustomers(a, b) {
    const rewardsA =
        getLoyaltyData(
            a
        ).availableRewards;

    const rewardsB =
        getLoyaltyData(
            b
        ).availableRewards;

    if (rewardsA !== rewardsB) {
        return rewardsB - rewardsA;
    }

    return (
        Number(b.visits || 0) -
        Number(a.visits || 0)
    );
}


function createCustomerCard(customer) {
    const loyalty =
        getLoyaltyData(customer);

    const hasReward =
        loyalty.availableRewards > 0;

    return `
        <article class="unified-card">

            <div class="unified-card-header">

                <div class="unified-card-person">

                    <div class="unified-card-avatar">
                        ${escapeHTML(
                            getInitials(
                                customer.name
                            )
                        )}
                    </div>

                    <div class="unified-card-title">

                        <h3>
                            ${escapeHTML(
                                customer.name
                            )}
                        </h3>

                        <span>
                            Cliente
                        </span>

                    </div>

                </div>


                <div
                    class="
                        unified-status
                        ${
                            hasReward
                                ? "reward"
                                : "progress"
                        }
                    "
                >

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

                    <span>
                        Visitas
                    </span>

                    <strong>
                        ${Number(
                            customer.visits || 0
                        )}
                    </strong>

                </div>


                <div>

                    <span>
                        Progreso
                    </span>

                    <strong>
                        ${loyalty.progress}/${VISITS_REQUIRED}
                    </strong>

                </div>

            </div>


            <div class="unified-card-detail">

                <span>
                    Fidelidad
                </span>

                <div class="simple-loyalty-stamps">

                    ${renderStamps(
                        loyalty.progress
                    )}

                </div>

                <small>
                    ${
                        hasReward
                            ? `${loyalty.availableRewards} recompensa disponible`
                            : `Faltan ${loyalty.remaining} visitas`
                    }
                </small>

            </div>


            <div class="unified-card-footer">

                <span>
                    ${escapeHTML(
                        customer.phone ||
                        "Sin teléfono"
                    )}
                </span>

                <button
                    type="button"
                    class="modern-edit-button"
                    data-action="view"
                    data-id="${escapeHTML(
                        customer.id
                    )}"
                >
                    Ver cliente
                    <span>→</span>
                </button>

            </div>

        </article>
    `;
}


function handleGridAction(event) {
    const button =
        event.target.closest(
            "[data-action]"
        );

    if (!button) {
        return;
    }

    if (
        button.dataset.action ===
        "view"
    ) {
        openCustomerLoyalty(
            button.dataset.id
        );
    }
}


function openCustomerLoyalty(customerId) {
    const customer =
        getCustomers().find(
            item =>
                item.id === customerId
        );

    if (!customer) {
        return;
    }

    selectedCustomerId =
        customer.id;

    renderCustomerModal(customer);

    loyaltyModal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );
}


function renderCustomerModal(customer) {
    const loyalty =
        getLoyaltyData(customer);

    loyaltyModalAvatar.textContent =
        getInitials(customer.name);

    loyaltyModalName.textContent =
        customer.name;

    loyaltyModalPhone.textContent =
        customer.phone ||
        "Sin teléfono";

    loyaltyModalVisits.textContent =
        loyalty.visits;

    loyaltyModalEarned.textContent =
        loyalty.totalRewardsEarned;

    loyaltyModalRedeemed.textContent =
        loyalty.redeemed;

    loyaltyModalStamps.innerHTML =
        renderLargeStamps(
            loyalty.progress
        );

    loyaltyModalProgress.style.width =
        `${
            (
                loyalty.progress /
                VISITS_REQUIRED
            ) * 100
        }%`;

    if (
        loyalty.availableRewards > 0
    ) {
        loyaltyRewardStatus.className =
            "unified-status reward";

        loyaltyRewardStatus.innerHTML =
            "<span></span> Recompensa";

        loyaltyModalDescription.textContent =
            "El cliente tiene una recompensa disponible.";

        redeemRewardButton.disabled =
            false;
    } else {
        loyaltyRewardStatus.className =
            "unified-status progress";

        loyaltyRewardStatus.innerHTML =
            "<span></span> En progreso";

        loyaltyModalDescription.textContent =
            `${loyalty.progress}/${VISITS_REQUIRED} visitas · Faltan ${loyalty.remaining}.`;

        redeemRewardButton.disabled =
            true;
    }
}


function closeLoyaltyModal() {
    loyaltyModal.classList.add(
        "hidden"
    );

    selectedCustomerId = null;

    unlockBody();
}


function registerSelectedCustomerVisit() {
    if (!selectedCustomerId) {
        return;
    }

    const id =
        selectedCustomerId;

    registerCustomerVisit(id);

    const customer =
        getCustomers().find(
            item =>
                item.id === id
        );

    if (customer) {
        selectedCustomerId = id;
        renderCustomerModal(customer);
    }
}


function redeemSelectedReward() {
    if (!selectedCustomerId) {
        return;
    }

    const customers =
        getCustomers();

    const customer =
        customers.find(
            item =>
                item.id ===
                selectedCustomerId
        );

    if (!customer) {
        return;
    }

    const loyalty =
        getLoyaltyData(customer);

    if (
        loyalty.availableRewards <= 0
    ) {
        showToast(
            "No hay una recompensa disponible."
        );

        return;
    }

    customer.rewardsRedeemed =
        Number(
            customer.rewardsRedeemed ||
            0
        ) + 1;

    saveCustomers(customers);

    renderAll();
    renderCustomerModal(customer);

    showToast(
        "Recompensa canjeada correctamente."
    );
}


function openVisitModal() {
    visitCustomerSearch.value = "";

    renderVisitCustomerResults();

    visitModal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );

    setTimeout(
        () =>
            visitCustomerSearch.focus(),
        50
    );
}


function closeVisitModal() {
    visitModal.classList.add(
        "hidden"
    );

    unlockBody();
}


function renderVisitCustomerResults() {
    const search =
        visitCustomerSearch.value
            .trim()
            .toLowerCase();

    const normalized =
        normalizePhone(search);

    const customers =
        getCustomers()
            .filter(customer => {
                if (!search) {
                    return true;
                }

                return (
                    customer.name
                        .toLowerCase()
                        .includes(search) ||
                    (
                        normalized &&
                        normalizePhone(
                            customer.phone ||
                            ""
                        ).includes(
                            normalized
                        )
                    )
                );
            })
            .slice(0, 6);

    if (!customers.length) {
        visitCustomerResults.innerHTML = `
            <div class="simple-result-empty">
                No se encontraron clientes.
            </div>
        `;

        return;
    }

    visitCustomerResults.innerHTML =
        customers
            .map(customer => {
                const loyalty =
                    getLoyaltyData(
                        customer
                    );

                return `
                    <button
                        type="button"
                        class="simple-customer-result"
                        data-customer-id="${escapeHTML(
                            customer.id
                        )}"
                    >

                        <div class="simple-result-avatar">
                            ${escapeHTML(
                                getInitials(
                                    customer.name
                                )
                            )}
                        </div>

                        <div>

                            <strong>
                                ${escapeHTML(
                                    customer.name
                                )}
                            </strong>

                            <span>
                                ${escapeHTML(
                                    customer.phone ||
                                    "Sin teléfono"
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


function handleVisitCustomerResult(event) {
    const button =
        event.target.closest(
            "[data-customer-id]"
        );

    if (!button) {
        return;
    }

    registerCustomerVisit(
        button.dataset.customerId
    );

    closeVisitModal();
}


function registerCustomerVisit(customerId) {
    const customers =
        getCustomers();

    const customer =
        customers.find(
            item =>
                item.id === customerId
        );

    if (!customer) {
        return;
    }

    customer.visits =
        Number(
            customer.visits || 0
        ) + 1;

    saveCustomers(customers);

    renderAll();

    showToast(
        `Visita registrada para ${customer.name}.`
    );
}


function getLoyaltyData(customer) {
    const visits =
        Math.max(
            0,
            Number(
                customer.visits || 0
            )
        );

    const redeemed =
        Math.max(
            0,
            Number(
                customer.rewardsRedeemed ||
                0
            )
        );

    const totalRewardsEarned =
        Math.floor(
            visits /
            VISITS_REQUIRED
        );

    const availableRewards =
        Math.max(
            0,
            totalRewardsEarned -
            redeemed
        );

    let progress =
        visits %
        VISITS_REQUIRED;

    if (
        availableRewards > 0 &&
        progress === 0
    ) {
        progress =
            VISITS_REQUIRED;
    }

    const remaining =
        progress === VISITS_REQUIRED
            ? 0
            : VISITS_REQUIRED -
              progress;

    return {
        visits,
        redeemed,
        totalRewardsEarned,
        availableRewards,
        progress,
        remaining
    };
}


function renderStamps(progress) {
    return Array.from(
        {
            length: VISITS_REQUIRED
        },
        (_, index) => `
            <span
                class="
                    simple-loyalty-stamp
                    ${
                        index < progress
                            ? "active"
                            : ""
                    }
                "
            >
                ✂
            </span>
        `
    ).join("");
}


function renderLargeStamps(progress) {
    return Array.from(
        {
            length: VISITS_REQUIRED
        },
        (_, index) => `
            <span
                class="
                    loyalty-stamp
                    ${
                        index < progress
                            ? "active"
                            : ""
                    }
                "
            >
                ✂
            </span>
        `
    ).join("");
}


function unlockBody() {
    if (
        loyaltyModal.classList.contains(
            "hidden"
        ) &&
        visitModal.classList.contains(
            "hidden"
        )
    ) {
        document.body.classList.remove(
            "modal-open"
        );
    }
}


function getInitials(name) {
    return String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(
            word =>
                word.charAt(0)
        )
        .join("")
        .toUpperCase() || "?";
}


function escapeHTML(value) {
    const element =
        document.createElement("div");

    element.textContent =
        String(value ?? "");

    return element.innerHTML;
}


function showToast(message) {
    const toast =
        document.getElementById("toast");

    toast.textContent =
        message;

    toast.classList.add(
        "show"
    );

    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(
            () =>
                toast.classList.remove(
                    "show"
                ),
            2800
        );
}


initialize();