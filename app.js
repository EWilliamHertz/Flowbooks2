import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, writeBatch, serverTimestamp, documentId, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

// ----- Google API-konstanter -----
const GOOGLE_API_KEY = "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU";
const GOOGLE_CLIENT_ID = "ERSTATT_MED_DIN_OAUTH_CLIENT_ID.apps.googleusercontent.com";
const GOOGLE_APP_ID = "ERSTATT_MED_DITT_APP_ID_FRAN_GOOGLE_PROJECT";
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
let tokenClient;

let currentUser;
let userData;

// ----- Globala variabler för transaktionsdata -----
let allIncomes = [];
let allExpenses = [];
let allTransactions = [];
let recurringTransactions = [];
let categories = [];
let teamMembers = [];
let allProducts = [];
let userCompanies = [];
let currentCompany = null;

// ----- Funktion för Moderna Notiser (Toasts) -----
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// ----- Funktion för Laddningsindikator (Spinner) -----
function renderSpinner() {
    return `<div class="spinner-container"><div class="spinner"></div></div>`;
}

// ----- HUVUDFUNKTIONER & FELHANTERING -----
function showFatalError(message) {
    document.getElementById('app-container').style.visibility = 'visible';
    const mainView = document.getElementById('main-view');
    document.querySelector('.sidebar').innerHTML = '<div class="sidebar-header"><h2 class="logo">FlowBooks</h2></div>';
    document.querySelector('.main-header').innerHTML = `<div class="header-left"><h1 class="page-title">Fel</h1></div>`;
    mainView.innerHTML = `<div class="card card-danger"><h3>Ett problem har uppstått</h3><p>${message}</p><p>Den rekommenderade lösningen är att skapa ett nytt konto.</p><button id="logout-btn-error" class="btn btn-primary" style="margin-top: 1rem;">Logga ut och Registrera nytt konto</button></div>`;
    document.getElementById('logout-btn-error').addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = 'register.html';
    });
}

function main() {
    onAuthStateChanged(auth, async (user) => {
        if (user && user.emailVerified) {
            currentUser = user;
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                userData = { id: userDocSnap.id, ...userDocSnap.data() };
                await fetchUserCompanies();
                if (userCompanies.length > 0) {
                    currentCompany = userCompanies[0];
                    await fetchAllCompanyData();
                    initializeAppUI();
                } else {
                    showFatalError("Ditt konto är inte kopplat till något företag, eller så kunde företaget inte hittas.");
                }
            } else {
                showFatalError("Ditt konto saknas i databasen.");
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}

async function fetchUserCompanies() {
    userCompanies = [];
    try {
        if (!userData || !userData.companyId) {
            console.error("Användardata saknar companyId. Kan inte hämta företag.");
            return;
        }

        const companyRef = doc(db, 'companies', userData.companyId);
        const companySnap = await getDoc(companyRef);

        if (companySnap.exists()) {
            const companyData = { id: companySnap.id, ...companySnap.data() };
            companyData.role = (companyData.ownerId === currentUser.uid) ? 'owner' : 'member';
            userCompanies.push(companyData);
        } else {
            console.error(`Fel: Företagsdokument med ID ${userData.companyId} existerar inte.`);
        }

    } catch (error) {
        console.error("Ett fel uppstod vid hämtning av företag:", error);
        showToast("Kunde inte hämta företagsinformation.", "error");
    }
}

async function fetchAllCompanyData() {
    if (!currentCompany) return;
    try {
        const companyId = currentCompany.id;

        const companyRef = doc(db, 'companies', companyId);
        const companySnap = await getDoc(companyRef);
        
        let memberUIDs = [];
        if (companySnap.exists() && Array.isArray(companySnap.data().members)) {
            memberUIDs = companySnap.data().members;
        }
        if (currentCompany.ownerId && !memberUIDs.includes(currentCompany.ownerId)) {
            memberUIDs.push(currentCompany.ownerId);
        }

        const queries = [
            getDocs(query(collection(db, 'incomes'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'expenses'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'recurring'), where('companyId', '==', companyId))),
            getDocs(query(collection(db, 'categories'), where('companyId', '==', companyId), orderBy('name'))),
            getDocs(query(collection(db, 'products'), where('companyId', '==', companyId), orderBy('name')))
        ];

        if (memberUIDs.length > 0) {
            queries.push(getDocs(query(collection(db, 'users'), where(documentId(), 'in', memberUIDs))));
        }

        const results = await Promise.all(queries);
        
        allIncomes = results[0].docs.map(d => ({ id: d.id, ...d.data() }));
        allExpenses = results[1].docs.map(d => ({ id: d.id, ...d.data() }));
        recurringTransactions = results[2].docs.map(d => ({ id: d.id, ...d.data() }));
        categories = results[3].docs.map(d => ({ id: d.id, ...d.data() }));
        allProducts = results[4].docs.map(d => ({ id: d.id, ...d.data() }));
        teamMembers = results.length > 5 ? results[5].docs.map(d => ({ id: d.id, ...d.data() })) : [];
        
        allTransactions = [
            ...allIncomes.map(t => ({ ...t, type: 'income' })),
            ...allExpenses.map(t => ({ ...t, type: 'expense' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

    } catch (error) {
        console.error("Kunde inte ladda all företagsdata:", error);
        showToast("Kunde inte ladda all företagsdata.", "error");
    }
}

function initializeAppUI() {
    updateProfileIcon();
    setupCompanySelector();
    setupEventListeners();
    navigateTo('Översikt');
    document.getElementById('app-container').style.visibility = 'visible';
}

function setupCompanySelector() {
    const selector = document.getElementById('company-selector');
    selector.innerHTML = userCompanies.map(company => 
        `<option value="${company.id}" ${company.id === currentCompany.id ? 'selected' : ''}>
            ${company.name} ${company.role === 'owner' ? '(Ägare)' : ''}
        </option>`
    ).join('');
    
    selector.addEventListener('change', async (e) => {
        const selectedCompanyId = e.target.value;
        currentCompany = userCompanies.find(c => c.id === selectedCompanyId);
        await fetchAllCompanyData();
        
        const currentPage = document.querySelector('.page-title').textContent;
        if (currentPage !== 'Översikt Alla Företag') {
            renderPageContent(currentPage);
        }
        
        showToast(`Bytte till ${currentCompany.name}`, 'success');
    });
}

function setupEventListeners() {
    document.querySelector('.sidebar-nav').addEventListener('click', e => {
        if (e.target.tagName === 'A' && e.target.dataset.page) {
            e.preventDefault();
            navigateTo(e.target.dataset.page);
        }
    });
    document.getElementById('user-profile-icon').addEventListener('click', () => {
        document.getElementById('profile-dropdown').classList.toggle('show');
    });
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('settings-link').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('profile-dropdown').classList.remove('show');
        navigateTo('Inställningar');
    });
    document.getElementById('hamburger-btn').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
}

function navigateTo(page) {
    const appContainer = document.getElementById('app-container');
    const header = document.querySelector('.main-header');
    
    // Hantera portal-vyn
    if (page === 'Översikt Alla Företag') {
        appContainer.classList.add('portal-view');
        header.style.display = 'none'; // Göm hela headern i portalvyn
    } else {
        appContainer.classList.remove('portal-view');
        header.style.display = 'flex'; // Visa headern igen
    }

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (link) link.classList.add('active');
    
    renderPageContent(page);
    document.querySelector('.sidebar').classList.remove('open');
}

// ----- SID-RENDERING -----
function renderPageContent(page) {
    const mainView = document.getElementById('main-view');
    const pageTitle = document.querySelector('.page-title');
    const newItemBtn = document.getElementById('new-item-btn');
    
    pageTitle.textContent = page;
    mainView.innerHTML = ''; 
    newItemBtn.style.display = 'none';

    switch (page) {
        case 'Översikt': renderDashboard(); break;
        case 'Översikt Alla Företag': renderAllCompaniesDashboard(); break;
        // ... resten av case-satserna är oförändrade ...
        case 'Sammanfattning': renderSummaryPage(); break;
        case 'Fakturor': mainView.innerHTML = `<div class="card"><h3 class="card-title">Fakturor</h3><p>Denna sektion är under utveckling.</p></div>`; break;
        case 'Rapporter': mainView.innerHTML = `<div class="card"><h3 class="card-title">Rapporter</h3><p>Denna sektion är under utveckling.</p></div>`; break;
        case 'Importera': renderImportPage(); break;
        case 'Intäkter':
            newItemBtn.textContent = 'Ny Intäkt';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderTransactionForm('income');
            renderTransactionList('income');
            break;
        case 'Utgifter':
            newItemBtn.textContent = 'Ny Utgift';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderTransactionForm('expense');
            renderTransactionList('expense');
            break;
        case 'Återkommande':
            newItemBtn.textContent = 'Ny Återkommande';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderRecurringTransactionForm();
            renderRecurringPage();
            break;
        case 'Produkter':
            newItemBtn.textContent = 'Ny Produkt';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = () => renderProductForm();
            renderProductsPage();
            break;
        case 'Kategorier': renderCategoriesPage(); break;
        case 'Team': renderTeamPage(); break;
        case 'Inställningar': renderSettingsPage(); break;
        default: mainView.innerHTML = `<div class="card"><h3 class="card-title">Sidan '${page}' hittades inte</h3></div>`;
    }
}

// ----- ÖVERSIKT ALLA FÖRETAG (NY DESIGN) -----
async function renderAllCompaniesDashboard() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner();
    
    try {
        // Vi antar att userCompanies redan är hämtad.
        // För varje företag, hämta dess detaljerade data.
        const companiesDataPromises = userCompanies.map(async (company) => {
            const companyId = company.id;
            const [incomesSnap, expensesSnap, productsSnap] = await Promise.all([
                getDocs(query(collection(db, 'incomes'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'expenses'), where('companyId', '==', companyId))),
                getDocs(query(collection(db, 'products'), where('companyId', '==', companyId)))
            ]);
            
            const totalIncome = incomesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const totalExpenses = expensesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            
            return {
                ...company,
                totalIncome,
                totalExpenses,
                netProfit: totalIncome - totalExpenses,
                productCount: productsSnap.size,
                transactionCount: incomesSnap.size + expensesSnap.size
            };
        });

        const companiesData = await Promise.all(companiesDataPromises);

        const grandTotalProfit = companiesData.reduce((sum, company) => sum + company.netProfit, 0);

        const dashboardHtml = `
            <div class="portal-header">
                <h1 class="logo">FlowBooks</h1>
                <p>Välkommen, ${userData.firstName}. Du har tillgång till ${companiesData.length} företag.</p>
                <div class="portal-total-profit">
                    <span>Totalt Nettoresultat:</span>
                    <strong class="${grandTotalProfit >= 0 ? 'green' : 'red'}">${grandTotalProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}</strong>
                </div>
            </div>
            <div class="company-cards-container">
                ${companiesData.map(company => `
                    <div class="company-card" onclick="window.switchToCompany('${company.id}')">
                        <div class="company-card-header">
                            <h3>${company.name}</h3>
                            <span class="badge ${company.role === 'owner' ? 'badge-owner' : 'badge-member'}">${company.role}</span>
                        </div>
                        <div class="company-card-body">
                            <div class="stat">
                                <span class="label">Nettoresultat</span>
                                <span class="value ${company.netProfit >= 0 ? 'green' : 'red'}">
                                    ${company.netProfit.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}
                                </span>
                            </div>
                            <div class="stat">
                                <span class="label">Intäkter</span>
                                <span class="value green">
                                    ${company.totalIncome.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}
                                </span>
                            </div>
                            <div class="stat">
                                <span class="label">Utgifter</span>
                                <span class="value red">
                                    ${company.totalExpenses.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' })}
                                </span>
                            </div>
                        </div>
                        <div class="company-card-footer">
                            <span>${company.transactionCount} transaktioner</span>
                            <span>${company.productCount} produkter</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        mainView.innerHTML = dashboardHtml;
        
    } catch (error) {
        console.error('Fel vid hämtning av företagsdata för portalen:', error);
        mainView.innerHTML = '<div class="card card-danger"><h3>Kunde inte ladda företagsöversikten</h3><p>Kontrollera dina säkerhetsregler och försök igen.</p></div>';
    }
}

// Gör funktionen globalt tillgänglig så den kan anropas från HTML-onclick
window.switchToCompany = (companyId) => {
    currentCompany = userCompanies.find(c => c.id === companyId);
    if (currentCompany) {
        // Sätt värdet i dropdownen (även om den är dold) för konsekvens
        document.getElementById('company-selector').value = companyId;
        navigateTo('Översikt'); // Navigera till det valda företagets dashboard
    }
};


// ----- RESTEN AV app.js -----
// Alla andra funktioner (renderDashboard, renderTransactionList, etc.)
// förblir oförändrade från din originalfil. Jag har utelämnat dem här
// för att hålla koden kortfattad, men de ska finnas kvar i din fil.
// Se till att all kod från raden "function renderDashboard() {...}" och framåt
// finns kvar i din slutgiltiga app.js-fil.

// ... (se till att all din övriga kod från den tidigare versionen finns här) ...
// Inkluderar resten av funktionerna... (Team, Kategorier, Återkommande, Transaktioner, etc.)
// ... (Hela resten av filen är här, korrekt sammanfogad)

// ----- TEAM -----
function renderTeamPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3 class="card-title">Teammedlemmar</h3>
                <p>Personer med tillgång till företaget <strong>${currentCompany.name}</strong>.</p>
                <div id="team-list-container" style="margin-top: 1.5rem;">${renderSpinner()}</div>
            </div>
            <div class="card">
                <h3 class="card-title">Bjud in ny medlem</h3>
                <p>Personen kan skapa ett konto för att ansluta till ditt företag.</p>
                <div class="input-group"><label for="invite-email">E-postadress</label><input type="email" id="invite-email" placeholder="namn@exempel.com"></div>
                <button id="send-invite-btn" class="btn btn-primary" style="margin-top: 1rem;">Skicka inbjudan</button>
            </div>
        </div>`;

    renderTeamList();

    document.getElementById('send-invite-btn').addEventListener('click', async () => {
        const emailInput = document.getElementById('invite-email');
        const email = emailInput.value.trim().toLowerCase();
        
        if (!email) {
            showToast('Ange en giltig e-postadress.', 'warning');
            return;
        }

        try {
            const isMember = teamMembers.some(member => member.email === email);
            if (isMember) {
                showToast('Denna användare är redan medlem.', 'warning');
                return;
            }

            const invitationsRef = collection(db, 'invitations');
            const q = query(invitationsRef, where("email", "==", email), where("companyId", "==", currentCompany.id));
            const existingInvite = await getDocs(q);

            if (!existingInvite.empty) {
                showToast('En inbjudan har redan skickats till denna e-post.', 'warning');
                return;
            }

            await addDoc(invitationsRef, {
                email: email,
                companyId: currentCompany.id,
                companyName: currentCompany.name,
                invitedBy: currentUser.uid,
                createdAt: serverTimestamp()
            });

            showToast(`Inbjudan skickad till ${email}!`, 'success');
            emailInput.value = '';

        } catch (error) {
            console.error("Kunde inte skicka inbjudan:", error);
            showToast('Ett fel uppstod. Försök igen.', 'error');
        }
    });
}

function renderTeamList() {
    const container = document.getElementById('team-list-container');
    if (!container) return;
    const memberItems = teamMembers.map(member => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
            <div>
                <p style="font-weight: 600; margin: 0;">${member.firstName} ${member.lastName}</p>
                <p style="font-size: 0.9rem; color: var(--text-color-light); margin: 0;">${member.position}</p>
            </div>
            <span>${member.email}</span>
        </div>`).join('');
    container.innerHTML = memberItems;
}


// ----- KATEGORIER -----
function renderCategoriesPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="settings-grid"><div class="card"><h3 class="card-title">Mina Kategorier</h3><p>Lägg till och hantera kategorier för dina transaktioner.</p><div id="category-list-container" style="margin-top: 1.5rem;">${renderSpinner()}</div></div><div class="card"><h3 class="card-title">Skapa Ny Kategori</h3><div class="input-group"><label for="new-category-name">Kategorinamn</label><input type="text" id="new-category-name" placeholder="T.ex. Kontorsmaterial"></div><button id="save-category-btn" class="btn btn-primary" style="margin-top: 1rem;">Spara Kategori</button></div></div>`;
    renderCategoryList();
    document.getElementById('save-category-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-category-name');
        const name = nameInput.value.trim();
        if (!name) { showToast('Ange ett namn för kategorin.', 'warning'); return; }
        try {
            await addDoc(collection(db, 'categories'), { name, companyId: currentCompany.id, createdAt: serverTimestamp() });
            showToast('Kategori sparad!', 'success');
            nameInput.value = '';
            await fetchAllCompanyData();
            renderCategoryList();
        } catch (error) {
            console.error("Kunde inte spara kategori:", error);
            showToast('Ett fel uppstod.', 'error');
        }
    });
}

function renderCategoryList() {
    const container = document.getElementById('category-list-container');
    if (!container) return;
    if (categories.length === 0) {
        container.innerHTML = '<p>Du har inte skapat några kategorier än.</p>';
        return;
    }
    const categoryItems = categories.map(cat => `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border-color);"><span>${cat.name}</span><button class="btn btn-danger" data-id="${cat.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Ta bort</button></div>`).join('');
    container.innerHTML = categoryItems;
    container.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm('Är du säker?')) {
                try {
                    await deleteDoc(doc(db, 'categories', id));
                    showToast('Kategori borttagen.', 'success');
                    await fetchAllCompanyData();
                    renderCategoryList();
                } catch (error) {
                    console.error("Kunde inte ta bort kategori:", error);
                    showToast('Kunde inte ta bort kategorin.', 'error');
                }
            }
        });
    });
}


// ----- ÅTERKOMMANDE TRANSAKTIONER -----
function renderRecurringPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="card"><h3>Hantering av Återkommande Transaktioner</h3><p>Schemalagda intäkter och utgifter som skapas automatiskt.</p><button id="run-recurring-btn" class="btn btn-secondary" style="margin-top: 1rem;">Simulera månadskörning</button></div><div class="card" style="margin-top: 1.5rem;"><h3>Mina Återkommande Transaktioner</h3><div id="recurring-list-container">${renderSpinner()}</div></div>`;
    document.getElementById('run-recurring-btn').addEventListener('click', runRecurringTransactions);
    renderRecurringList();
}

function renderRecurringList() {
    const container = document.getElementById('recurring-list-container');
    if (!container) return;
    const rows = recurringTransactions.map(item => `<tr><td>${item.type === 'income' ? 'Intäkt' : 'Utgift'}</td><td>${item.description}</td><td>${item.party || ''}</td><td class="text-right ${item.type === 'income' ? 'green' : 'red'}">${Number(item.amount).toFixed(2)} kr</td><td>Varje månad</td><td>${item.nextDueDate}</td><td><button class="btn btn-danger" data-id="${item.id}" style="padding: 0.3rem 0.6rem; font-size: 0.85rem;">Ta bort</button></td></tr>`).join('');
    container.innerHTML = `<table class="data-table"><thead><tr><th>Typ</th><th>Beskrivning</th><th>Motpart</th><th class="text-right">Summa</th><th>Frekvens</th><th>Nästa Datum</th><th>Åtgärd</th></tr></thead><tbody>${rows.length > 0 ? rows : `<tr><td colspan="7" class="text-center">Du har inga återkommande transaktioner.</td></tr>`}</tbody></table>`;
    container.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm('Är du säker?')) {
                try {
                    await deleteDoc(doc(db, 'recurring', id));
                    await fetchAllCompanyData();
                    renderRecurringList();
                    showToast('Borttagen.', 'success');
                } catch (error) {
                    console.error("Kunde inte ta bort:", error);
                    showToast('Ett fel uppstod.', 'error');
                }
            }
        });
    });
}

function renderRecurringTransactionForm() {
    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;"><h3>Skapa Ny Återkommande Transaktion</h3><div class="input-group"><label>Typ</label><select id="rec-type"><option value="expense">Utgift</option><option value="income">Intäkt</option></select></div><div class="input-group"><label>Startdatum</label><input id="rec-date" type="date" value="${today}"></div><div class="input-group"><label>Beskrivning</label><input id="rec-desc" type="text"></div><div class="input-group"><label>Motpart</label><input id="rec-party" type="text"></div><div class="input-group"><label>Summa (SEK)</label><input id="rec-amount" type="number" placeholder="0.00"></div><div style="display: flex; gap: 1rem; margin-top: 1.5rem;"><button id="cancel-btn" class="btn btn-secondary">Avbryt</button><button id="save-btn" class="btn btn-primary">Spara</button></div></div>`;
    document.getElementById('save-btn').addEventListener('click', async () => {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sparar...';
        const data = { type: document.getElementById('rec-type').value, nextDueDate: document.getElementById('rec-date').value, description: document.getElementById('rec-desc').value, party: document.getElementById('rec-party').value, amount: parseFloat(document.getElementById('rec-amount').value) || 0, frequency: 'monthly', userId: currentUser.uid, companyId: currentCompany.id, createdAt: serverTimestamp() };
        if (!data.nextDueDate || !data.description || data.amount <= 0) {
            showToast('Fyll i alla fält korrekt.', 'warning');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Spara';
            return;
        }
        try {
            await addDoc(collection(db, 'recurring'), data);
            await fetchAllCompanyData();
            navigateTo('Återkommande');
            showToast('Sparad!', 'success');
        } catch (error) {
            console.error("Kunde inte spara:", error);
            showToast('Ett fel uppstod.', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Spara';
        }
    });
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo('Återkommande'));
}

async function runRecurringTransactions() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const transactionsToCreate = recurringTransactions.filter(item => item.nextDueDate && item.nextDueDate <= todayStr);
    if (transactionsToCreate.length === 0) { showToast("Inga transaktioner att generera idag.", "info"); return; }
    const runBtn = document.getElementById('run-recurring-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Genererar...';
    const batch = writeBatch(db);
    let count = 0;
    for (const item of transactionsToCreate) {
        const collectionName = item.type === 'income' ? 'incomes' : 'expenses';
        const docRef = doc(collection(db, collectionName));
        const transactionData = { date: item.nextDueDate, description: item.description, party: item.party, amount: item.amount, userId: item.userId, companyId: item.companyId, createdAt: serverTimestamp(), isCorrection: false, attachmentUrl: null, generatedFromRecurring: true };
        batch.set(docRef, transactionData);
        count++;
        const nextDate = new Date(item.nextDueDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        const newDueDate = nextDate.toISOString().slice(0, 10);
        const recurringDocRef = doc(db, 'recurring', item.id);
        batch.update(recurringDocRef, { nextDueDate: newDueDate });
    }
    try {
        await batch.commit();
        await fetchAllCompanyData();
        renderRecurringList();
        showToast(`${count} transaktion(er) har skapats automatiskt!`, 'success');
    } catch (error) {
        console.error("Fel vid generering:", error);
        showToast("Ett fel uppstod.", "error");
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = 'Simulera månadskörning';
    }
}


// ----- TABELLER, FORMULÄR, ETC. -----
function getControlsHTML() {
    return `<div class="controls-container"><div class="search-container"><input type="text" id="search-input" placeholder="Sök..."></div><div class="filter-container"><button class="btn filter-btn active" data-period="all">Alla</button><button class="btn filter-btn" data-period="this-month">Denna månad</button><button class="btn filter-btn" data-period="last-month">Förra månaden</button></div></div>`;
}

function applyFiltersAndRender(list, type) {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const activeFilterEl = document.querySelector('.filter-btn.active');
    const activeFilter = activeFilterEl ? activeFilterEl.dataset.period : 'all';
    let filteredList = list;
    if (searchTerm) {
        filteredList = filteredList.filter(t => t.description.toLowerCase().includes(searchTerm) || (t.party && t.party.toLowerCase().includes(searchTerm)));
    }
    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    if (activeFilter === 'this-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayThisMonth);
    } else if (activeFilter === 'last-month') {
        filteredList = filteredList.filter(t => new Date(t.date) >= firstDayLastMonth && new Date(t.date) <= lastDayLastMonth);
    }
    renderTransactionTable(filteredList, type);
}

function renderTransactionTable(transactions, type) {
    const container = document.getElementById('table-container');
    if (!container) return;
    const getCategoryName = (categoryId) => {
        if (!categoryId) return '-';
        const category = categories.find(c => c.id === categoryId);
        return category ? category.name : 'Okänd';
    };
    let head, rows;
    if (type === 'summary') {
        head = `<th>Datum</th><th>Beskrivning</th><th>Kategori</th><th>Motpart</th><th class="text-right">Summa</th><th>Åtgärd</th>`;
        rows = transactions.map(t => `<tr class="transaction-row ${t.type} ${t.isCorrection ? 'corrected' : ''}"><td>${t.date}</td><td>${t.description}</td><td>${getCategoryName(t.categoryId)}</td><td>${t.party || ''}</td><td class="text-right ${t.type === 'income' ? 'green' : 'red'}">${Number(t.amount).toFixed(2)} kr</td>${t.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${t.id}" data-type="${t.type}">Korrigera</button></td>`}</tr>`).join('');
    } else {
        head = `<th>Datum</th><th>Beskrivning</th><th>Kategori</th><th>Motpart</th><th class="text-right">Summa</th><th>Underlag</th><th>Åtgärd</th>`;
        rows = transactions.map(data => `<tr class="${data.isCorrection ? 'corrected' : ''}"><td>${data.date}</td><td>${data.description}</td><td>${getCategoryName(data.categoryId)}</td><td>${data.party || ''}</td><td class="text-right">${Number(data.amount).toFixed(2)} kr</td>${data.attachmentUrl ? `<td><a href="${data.attachmentUrl}" target="_blank" class="receipt-link">Visa</a></td>` : '<td>-</td>'}${data.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${data.id}" data-type="${type}">Korrigera</button></td>`}</tr>`).join('');
    }
    container.innerHTML = `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows.length > 0 ? rows : `<tr><td colspan="${head.split('</th>').length - 1}" class="text-center">Inga transaktioner att visa.</td></tr>`}</tbody></table>`;
    container.querySelectorAll('.btn-correction').forEach(btn => {
        btn.addEventListener('click', (e) => renderCorrectionForm(e.target.dataset.type, e.target.dataset.id));
    });
}

function renderDashboard() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = renderSpinner();
    setTimeout(() => {
        const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
        const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);
        const profit = totalIncome - totalExpense;
        mainView.innerHTML = `<div class="dashboard-grid"><div class="card text-center"><h3>Totala Intäkter</h3><p class="metric-value green">${totalIncome.toFixed(2)} kr</p></div><div class="card text-center"><h3>Totala Utgifter</h3><p class="metric-value red">${totalExpense.toFixed(2)} kr</p></div><div class="card text-center"><h3>Resultat</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toFixed(2)} kr</p></div></div>`;
    }, 10);
}

function renderSummaryPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="card"><h3 class="card-title">Transaktionshistorik</h3>${getControlsHTML()}<div id="table-container">${renderSpinner()}</div></div>`;
    setTimeout(() => {
        applyFiltersAndRender(allTransactions, 'summary');
        document.getElementById('search-input').addEventListener('input', () => applyFiltersAndRender(allTransactions, 'summary'));
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.filter-btn.active').classList.remove('active');
                e.target.classList.add('active');
                applyFiltersAndRender(allTransactions, 'summary');
            });
        });
    }, 10);
}

function renderTransactionList(type) {
    const mainView = document.getElementById('main-view');
    const title = type === 'income' ? 'Registrerade Intäkter' : 'Registrerade Utgifter';
    const dataToList = type === 'income' ? allIncomes : allExpenses;
    mainView.innerHTML = `<div class="card"><h3 class="card-title">${title}</h3>${getControlsHTML()}<div id="table-container">${renderSpinner()}</div></div>`;
    setTimeout(() => {
        applyFiltersAndRender(dataToList, type);
        document.getElementById('search-input').addEventListener('input', () => applyFiltersAndRender(dataToList, type));
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.filter-btn.active').classList.remove('active');
                e.target.classList.add('active');
                applyFiltersAndRender(dataToList, type);
            });
        });
    }, 10);
}

function renderTransactionForm(type, originalData = {}, isCorrection = false, originalId = null) {
    const mainView = document.getElementById('main-view');
    const title = isCorrection ? 'Korrigera Transaktion' : `Registrera Ny ${type === 'income' ? 'Intäkt' : 'Utgift'}`;
    const today = new Date().toISOString().slice(0, 10);
    const categoryOptions = categories.map(cat => `<option value="${cat.id}" ${originalData.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('');
    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;"><h3>${title}</h3>${isCorrection ? `<p class="correction-notice">Du skapar en rättelsepost.</p>` : ''}<div class="input-group"><label>Datum</label><input id="trans-date" type="date" value="${originalData.date || today}"></div><div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text" value="${originalData.description || ''}"></div><div class="input-group"><label>Kategori</label><select id="trans-category"><option value="">Välj...</option>${categoryOptions}</select></div><div class="input-group"><label>Motpart</label><input id="trans-party" type="text" value="${originalData.party || ''}"></div><div class="input-group"><label>Summa (SEK)</label><input id="trans-amount" type="number" placeholder="0.00" value="${originalData.amount || ''}"></div><div class="input-group"><label>Underlag (valfritt)</label><input id="trans-attachment" type="file" accept="image/*,.pdf"></div><div style="display: flex; gap: 1rem; margin-top: 1rem;"><button id="cancel-btn" class="btn btn-secondary">Avbryt</button><button id="save-btn" class="btn btn-primary">${isCorrection ? 'Spara Rättelse' : 'Spara'}</button></div></div>`;
    document.getElementById('save-btn').addEventListener('click', () => {
        const newData = { date: document.getElementById('trans-date').value, description: document.getElementById('trans-desc').value, party: document.getElementById('trans-party').value, amount: parseFloat(document.getElementById('trans-amount').value) || 0, categoryId: document.getElementById('trans-category').value || null };
        if (isCorrection) { handleCorrectionSave(type, originalId, originalData, newData); } else { handleSave(type, newData); }
    });
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter'));
}

async function handleSave(type, data) {
    const attachmentFile = document.getElementById('trans-attachment').files[0];
    const transactionData = { ...data, userId: currentUser.uid, companyId: currentCompany.id, createdAt: serverTimestamp(), isCorrection: false, attachmentUrl: null };
    if (!transactionData.date || !transactionData.description || transactionData.amount <= 0) {
        showToast('Fyll i datum, beskrivning och en giltig summa.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const saveButton = document.querySelector('#modal-container .btn-primary');
        saveButton.disabled = true;
        saveButton.textContent = 'Sparar...';
        if (attachmentFile) {
            const folder = type === 'income' ? 'income_attachments' : 'expense_attachments';
            const storageRef = ref(storage, `${folder}/${currentUser.uid}/${Date.now()}-${attachmentFile.name}`);
            try {
                await uploadBytes(storageRef, attachmentFile);
                transactionData.attachmentUrl = await getDownloadURL(storageRef);
            } catch (error) {
                console.error("Fel vid uppladdning:", error);
                showToast("Kunde inte ladda upp fil.", "error");
                saveButton.disabled = false;
                saveButton.textContent = 'Bekräfta';
                return;
            }
        }
        await saveTransaction(type, transactionData);
    }, "Bekräfta Bokföring", "Bekräfta denna post. Enligt Bokföringslagen är detta en slutgiltig aktion.");
}

async function handleCorrectionSave(type, originalId, originalData, newData) {
    if (!newData.date || !newData.description || newData.amount <= 0) {
        showToast('Fyll i alla fält korrekt.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const batch = writeBatch(db);
        const collectionName = type === 'income' ? 'incomes' : 'expenses';
        const originalDocRef = doc(db, collectionName, originalId);
        batch.update(originalDocRef, { isCorrection: true });
        const reversalPost = { ...originalData, amount: -originalData.amount, isCorrection: true, correctedPostId: originalId, description: `Rättelse av: ${originalData.description}`, createdAt: serverTimestamp() };
        const reversalDocRef = doc(collection(db, collectionName));
        batch.set(reversalDocRef, reversalPost);
        const newPost = { ...newData, userId: currentUser.uid, companyId: currentCompany.id, createdAt: serverTimestamp(), isCorrection: false, correctsPostId: originalId };
        const newDocRef = doc(collection(db, collectionName));
        batch.set(newDocRef, newPost);
        await batch.commit();
        await fetchAllCompanyData();
        navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
        showToast("Rättelsen har sparats.", "success");
    }, "Bekräfta Rättelse", "Detta kan inte ångras.");
}

async function saveTransaction(type, data) {
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    try {
        await addDoc(collection(db, collectionName), data);
        await fetchAllCompanyData();
        navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
        showToast("Transaktionen har sparats!", "success");
    } catch (error) {
        console.error("Fel vid sparning:", error);
        showToast("Kunde inte spara.", "error");
    }
}

function showConfirmationModal(onConfirm, title, message) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>${title}</h3><p>${message}</p><div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">Avbryt</button><button id="modal-confirm" class="btn btn-primary">Bekräfta</button></div></div></div>`;
    document.getElementById('modal-confirm').onclick = () => { container.innerHTML = ''; onConfirm(); };
    document.getElementById('modal-cancel').onclick = () => { container.innerHTML = ''; };
}

function initializeGisClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: '' });
}

function handleAuthClick() {
    if (GOOGLE_API_KEY === "ERSTATT_MED_DIN_API_NYCKEL" || GOOGLE_CLIENT_ID.startsWith("ERSTATT")) {
        showToast("Google Drive-integrationen är inte konfigurerad.", "error");
        return;
    }
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) { throw (resp); }
        createPicker();
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function createPicker() {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes("text/csv,application/vnd.google-apps.spreadsheet");
    const picker = new google.picker.PickerBuilder().setAppId(GOOGLE_APP_ID).setOAuthToken(gapi.client.getToken().access_token).addView(view).setDeveloperKey(GOOGLE_API_KEY).setCallback(pickerCallback).build();
    picker.setVisible(true);
}

async function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs[0];
        const fileId = doc.id;
        let fileContent;
        try {
            if (doc.mimeType === 'application/vnd.google-apps.spreadsheet') {
                const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: 'A:E' });
                fileContent = (response.result.values || []).map(row => row.join(',')).join('\n');
            } else {
                const response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media' });
                fileContent = response.body;
            }
            processFileContent(fileContent);
        } catch (error) {
            console.error("Fel vid hämtning av fil:", error);
            showToast("Kunde inte hämta filen.", "error");
        }
    }
}

function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="card"><h3>Importera Transaktioner</h3><p>Ladda upp en CSV-fil. Kolumner: <strong>Datum, Typ, Beskrivning, Motpart, Summa (SEK)</strong>.</p><hr style="margin: 1rem 0;"><h4>Alternativ 1: Ladda upp fil</h4><input type="file" id="csv-file-input" accept=".csv" style="display: block; margin-top: 1rem;"><hr style="margin: 1.5rem 0;"><h4>Alternativ 2: Importera från Google Drive</h4><button id="google-drive-import-btn" class="btn btn-secondary">Välj fil från Google Drive</button></div>`;
    document.getElementById('csv-file-input').addEventListener('change', handleFileSelect, false);
    document.getElementById('google-drive-import-btn').addEventListener('click', () => {
        gapi.load('client:picker', async () => {
            await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
            await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');
            initializeGisClient();
            handleAuthClick();
        });
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => processFileContent(e.target.result);
    reader.readAsText(file, 'UTF-8');
}

function processFileContent(text) {
     try {
        const transactions = parseCSV(text);
        if (transactions.length > 0) {
            showImportConfirmationModal(transactions);
        } else {
            showToast("Inga giltiga transaktioner hittades.", "warning");
        }
    } catch (error) {
        showToast(`Fel vid läsning: ${error.message}`, "error");
    }
}

function parseCSV(text) {
    const lines = text.split(/\r\n|\n/);
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['datum', 'typ', 'beskrivning', 'motpart', 'summa (sek)'];
    
    const idx = {
        date: header.indexOf(requiredHeaders[0]),
        type: header.indexOf(requiredHeaders[1]),
        description: header.indexOf(requiredHeaders[2]),
        party: header.indexOf(requiredHeaders[3]),
        amount: header.indexOf(requiredHeaders[4])
    };

    if (Object.values(idx).some(i => i === -1)) {
        throw new Error(`Filen saknar en eller flera av de obligatoriska kolumnerna: ${requiredHeaders.join(', ')}`);
    }
    
    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const data = lines[i].split(',');
        const type = data[idx.type]?.trim().toLowerCase();
        
        if (type !== 'intäkt' && type !== 'utgift') continue;
        
        const amountStr = data[idx.amount]?.replace(/"/g, '').replace(/\s/g, '').replace(',', '.');
        const amount = parseFloat(amountStr);

        if (isNaN(amount)) continue;

        transactions.push({
            date: data[idx.date]?.trim(),
            type: type.charAt(0).toUpperCase() + type.slice(1), // 'Intäkt' or 'Utgift'
            description: data[idx.description]?.trim(),
            party: data[idx.party]?.trim() || '',
            amount: Math.abs(amount),
            id: `import-${i}`
        });
    }
    return transactions;
}

function showImportConfirmationModal(transactions) {
    const modalContainer = document.getElementById('modal-container');
    const transactionRows = transactions.map(t => `<tr class="import-row"><td><input type="checkbox" class="import-checkbox" data-transaction-id="${t.id}" checked></td><td>${t.date}</td><td>${t.description}</td><td>${t.party}</td><td class="${t.type === 'Intäkt' ? 'green' : 'red'}">${t.type}</td><td class="text-right">${t.amount.toFixed(2)} kr</td></tr>`).join('');
    modalContainer.innerHTML = `<div class="modal-overlay"><div class="modal-content" style="max-width: 900px;"><h3>Granska och bekräfta import</h3><p>Bocka ur de du inte vill importera.</p><div style="max-height: 400px; overflow-y: auto;"><table class="data-table"><thead><tr><th><input type="checkbox" id="select-all-checkbox" checked></th><th>Datum</th><th>Beskrivning</th><th>Motpart</th><th>Typ</th><th class="text-right">Summa</th></tr></thead><tbody>${transactionRows}</tbody></table></div><div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">Avbryt</button><button id="modal-confirm-import" class="btn btn-primary">Importera valda</button></div></div></div>`;
    document.getElementById('modal-cancel').addEventListener('click', () => modalContainer.innerHTML = '');
    document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
        document.querySelectorAll('.import-checkbox').forEach(checkbox => checkbox.checked = e.target.checked);
    });
    document.getElementById('modal-confirm-import').addEventListener('click', async () => {
        const selectedIds = Array.from(document.querySelectorAll('.import-checkbox:checked')).map(cb => cb.dataset.transactionId);
        const transactionsToSave = transactions.filter(t => selectedIds.includes(t.id));
        if (transactionsToSave.length === 0) { showToast("Inga transaktioner valda.", "warning"); return; }
        const confirmBtn = document.getElementById('modal-confirm-import');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Sparar...';
        try {
            const batch = writeBatch(db);
            transactionsToSave.forEach(t => {
                const collectionName = t.type === 'Intäkt' ? 'incomes' : 'expenses';
                const docRef = doc(collection(db, collectionName));
                const dataToSave = { date: t.date, description: t.description, party: t.party, amount: t.amount, userId: currentUser.uid, companyId: currentCompany.id, createdAt: serverTimestamp(), isCorrection: false, attachmentUrl: null };
                batch.set(docRef, dataToSave);
            });
            await batch.commit();
            await fetchAllCompanyData();
            showToast(`${transactionsToSave.length} transaktioner har importerats!`, 'success');
            modalContainer.innerHTML = '';
            navigateTo('Sammanfattning');
        } catch (error) {
            console.error("Fel vid import:", error);
            showToast("Ett fel uppstod.", "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Importera valda';
        }
    });
}

function updateProfileIcon() {
    const profileIcon = document.getElementById('user-profile-icon');
    if (userData?.profileImageURL) {
        profileIcon.textContent = '';
        profileIcon.style.backgroundImage = `url(${userData.profileImageURL})`;
    } else {
        profileIcon.style.backgroundImage = '';
        const initial = userData?.companyName ? userData.companyName.charAt(0).toUpperCase() : '?';
        profileIcon.textContent = initial;
    }
}

function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="settings-grid"><div class="card"><h3>Profilbild</h3><p>Ladda upp en profilbild eller logotyp.</p><input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;"><button id="save-pic" class="btn btn-primary">Spara Bild</button></div><div class="card"><h3>Företagsinformation</h3><div class="input-group"><label>Företagsnamn</label><input id="setting-company" value="${currentCompany.name || ''}"></div><button id="save-company" class="btn btn-primary">Spara</button></div><div class="card card-danger"><h3>Ta bort konto</h3><p>All din data raderas permanent.</p><button id="delete-account" class="btn btn-danger">Ta bort kontot permanent</button></div></div>`;
    document.getElementById('save-pic').addEventListener('click', saveProfileImage);
    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
}

async function saveProfileImage() {
    const fileInput = document.getElementById('profile-pic-upload');
    const file = fileInput.files[0];
    if (!file) return;
    const storageRef = ref(storage, `profile_images/${currentUser.uid}/${file.name}`);
    try {
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'users', currentUser.uid), { profileImageURL: url });
        userData.profileImageURL = url;
        updateProfileIcon();
        showToast('Profilbilden är uppdaterad!', 'success');
    } catch (error) {
        console.error("Fel vid uppladdning:", error);
        showToast("Kunde inte spara profilbilden.", "error");
    }
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value;
    if (!newName) return;
    try {
        await updateDoc(doc(db, 'companies', currentCompany.id), { name: newName });
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        
        currentCompany.name = newName;
        userData.companyName = newName;
        
        updateProfileIcon();
        setupCompanySelector();
        showToast('Företagsinformationen är sparad!', 'success');
    } catch (error) {
        console.error("Fel vid sparning:", error);
        showToast("Kunde inte spara.", "error");
    }
}

async function deleteAccount() {
    if (prompt("Är du helt säker? Detta raderar ditt användarkonto men inte företagsdatan om andra medlemmar finns. Skriv 'RADERA' för att bekräfta.") === 'RADERA') {
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid));
            await auth.currentUser.delete();
            showToast("Ditt konto har tagits bort.", "info");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning:", error);
            showToast("Kunde inte ta bort kontot. Logga ut och in igen.", "error");
        }
    }
}

// ----- PRODUKTHANTERING -----
// (All produktkod är oförändrad och ska finnas här)
function renderProductsPage() {
    const mainView = document.getElementById('main-view');
    
    const searchHtml = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Produkter</h3>
                <div class="search-controls">
                    <input type="text" id="product-search" placeholder="Sök produkter..." class="form-input">
                    <button id="import-mtg-btn" class="btn btn-secondary">Importera MTG-kort</button>
                </div>
            </div>
        </div>
    `;
    
    const productsHtml = allProducts.length > 0 ? 
        `<div class="card">
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Bild</th>
                            <th>Namn</th>
                            <th>Typ</th>
                            <th>Pris</th>
                            <th>Lager</th>
                            <th>Åtgärder</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allProducts.map(product => `
                            <tr>
                                <td>
                                    ${product.imageUrl ? 
                                        `<img src="${product.imageUrl}" alt="${product.name}" style="width: 40px; height: 56px; object-fit: cover; border-radius: 4px;">` : 
                                        '<div style="width: 40px; height: 56px; background: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px;">Ingen bild</div>'
                                    }
                                </td>
                                <td><strong>${product.name}</strong></td>
                                <td>${product.type || 'Okänd'}</td>
                                <td>${product.price ? product.price + ' kr' : 'Ej satt'}</td>
                                <td>${product.stock || 0}</td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="editProduct('${product.id}')">Redigera</button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')">Ta bort</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : 
        `<div class="card">
            <div class="empty-state">
                <h3>Inga produkter ännu</h3>
                <p>Lägg till din första produkt eller importera Magic the Gathering-kort.</p>
            </div>
        </div>`;
    
    mainView.innerHTML = searchHtml + productsHtml;
    
    document.getElementById('product-search').addEventListener('input', filterProducts);
    document.getElementById('import-mtg-btn').addEventListener('click', showMTGImportModal);
}

function filterProducts() {
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const rows = document.querySelectorAll('.data-table tbody tr');
    
    rows.forEach(row => {
        const productName = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        const productType = row.querySelector('td:nth-child(3)').textContent.toLowerCase();
        
        if (productName.includes(searchTerm) || productType.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function renderProductForm(productId = null) {
    const product = productId ? allProducts.find(p => p.id === productId) : null;
    const isEdit = !!product;
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>${isEdit ? 'Redigera Produkt' : 'Ny Produkt'}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <form id="product-form" class="modal-body">
                    <div class="form-group">
                        <label for="product-name">Produktnamn *</label>
                        <input type="text" id="product-name" class="form-input" value="${product?.name || ''}" required>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="product-type">Typ</label>
                            <select id="product-type" class="form-input">
                                <option value="MTG Card" ${product?.type === 'MTG Card' ? 'selected' : ''}>Magic the Gathering-kort</option>
                                <option value="Board Game" ${product?.type === 'Board Game' ? 'selected' : ''}>Brädspel</option>
                                <option value="Accessory" ${product?.type === 'Accessory' ? 'selected' : ''}>Tillbehör</option>
                                <option value="Other" ${product?.type === 'Other' ? 'selected' : ''}>Övrigt</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="product-price">Pris (kr)</label>
                            <input type="number" id="product-price" class="form-input" step="0.01" value="${product?.price || ''}">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="product-stock">Lager</label>
                            <input type="number" id="product-stock" class="form-input" value="${product?.stock || 0}">
                        </div>
                        
                        <div class="form-group">
                            <label for="product-sku">SKU/Artikelnummer</label>
                            <input type="text" id="product-sku" class="form-input" value="${product?.sku || ''}">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="product-description">Beskrivning</label>
                        <textarea id="product-description" class="form-input" rows="3">${product?.description || ''}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="product-image-url">Bild-URL</label>
                        <input type="url" id="product-image-url" class="form-input" value="${product?.imageUrl || ''}" placeholder="https://...">
                        <small class="form-help">För MTG-kort hämtas bilder automatiskt från Scryfall</small>
                    </div>
                    
                    ${product?.mtgData ? `
                        <div class="form-group">
                            <label>Magic the Gathering Data</label>
                            <div class="mtg-data-display">
                                <p><strong>Mana Cost:</strong> ${product.mtgData.mana_cost || 'N/A'}</p>
                                <p><strong>Type:</strong> ${product.mtgData.type_line || 'N/A'}</p>
                                <p><strong>Set:</strong> ${product.mtgData.set_name || 'N/A'}</p>
                            </div>
                        </div>
                    ` : ''}
                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Avbryt</button>
                    <button type="submit" form="product-form" class="btn btn-primary">${isEdit ? 'Uppdatera' : 'Skapa'}</button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    
    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProduct(productId);
    });
}

async function saveProduct(productId = null) {
    const productData = {
        name: document.getElementById('product-name').value,
        type: document.getElementById('product-type').value,
        price: parseFloat(document.getElementById('product-price').value) || null,
        stock: parseInt(document.getElementById('product-stock').value) || 0,
        sku: document.getElementById('product-sku').value,
        description: document.getElementById('product-description').value,
        imageUrl: document.getElementById('product-image-url').value,
        companyId: currentCompany.id,
        updatedAt: serverTimestamp()
    };
    
    try {
        if (productId) {
            await updateDoc(doc(db, 'products', productId), productData);
            showToast('Produkten har uppdaterats!', 'success');
        } else {
            productData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'products'), productData);
            showToast('Produkten har skapats!', 'success');
        }
        
        await fetchAllCompanyData();
        renderProductsPage();
        closeModal();
    } catch (error) {
        console.error('Fel vid sparning av produkt:', error);
        showToast('Kunde inte spara produkten.', 'error');
    }
}

async function deleteProduct(productId) {
    if (confirm('Är du säker på att du vill ta bort denna produkt?')) {
        try {
            await deleteDoc(doc(db, 'products', productId));
            showToast('Produkten har tagits bort!', 'success');
            await fetchAllCompanyData();
            renderProductsPage();
        } catch (error) {
            console.error('Fel vid borttagning av produkt:', error);
            showToast('Kunde inte ta bort produkten.', 'error');
        }
    }
}

window.editProduct = (productId) => renderProductForm(productId);
window.deleteProduct = (productId) => deleteProduct(productId);


function showMTGImportModal() {
    const modalHtml = `
        <div class="modal-overlay" onclick="closeModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Importera Magic the Gathering-kort</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="mtg-search">Sök efter kort</label>
                        <input type="text" id="mtg-search" class="form-input" placeholder="Skriv kortnamn...">
                        <button id="search-mtg-btn" class="btn btn-primary" style="margin-top: 10px;">Sök</button>
                    </div>
                    
                    <div id="mtg-search-results" style="margin-top: 20px;"></div>
                    
                    <div class="form-group" style="margin-top: 20px;">
                        <label for="google-sheets-url">Eller importera från Google Sheets</label>
                        <input type="url" id="google-sheets-url" class="form-input" placeholder="https://docs.google.com/spreadsheets/...">
                        <small class="form-help">Klistra in länken till ditt Google Sheets-dokument</small>
                        <button id="import-sheets-btn" class="btn btn-secondary" style="margin-top: 10px;">Importera från Sheets</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Stäng</button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    
    document.getElementById('search-mtg-btn').addEventListener('click', searchMTGCards);
    document.getElementById('import-sheets-btn').addEventListener('click', importFromGoogleSheets);
}

async function searchMTGCards() {
    const searchTerm = document.getElementById('mtg-search').value.trim();
    if (!searchTerm) return;
    
    const resultsDiv = document.getElementById('mtg-search-results');
    resultsDiv.innerHTML = '<div class="loading">Söker kort...</div>';
    
    try {
        const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {
                'User-Agent': 'FlowBooks/1.0',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Kunde inte hämta kort från Scryfall');
        }
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const cardsHtml = data.data.slice(0, 10).map(card => `
                <div class="mtg-card-result" style="display: flex; align-items: center; padding: 10px; border: 1px solid #ddd; margin: 5px 0; border-radius: 4px;">
                    <img src="${card.image_uris?.small || ''}" alt="${card.name}" style="width: 50px; height: 70px; object-fit: cover; margin-right: 15px;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 5px 0;">${card.name}</h4>
                        <p style="margin: 0; color: #666; font-size: 14px;">${card.type_line}</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">${card.set_name} (${card.set})</p>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="importMTGCard('${card.id}')">Importera</button>
                </div>
            `).join('');
            
            resultsDiv.innerHTML = `<h4>Sökresultat:</h4>${cardsHtml}`;
        } else {
            resultsDiv.innerHTML = '<p>Inga kort hittades. Försök med ett annat sökord.</p>';
        }
    } catch (error) {
        console.error('Fel vid sökning av MTG-kort:', error);
        resultsDiv.innerHTML = '<p style="color: red;">Fel vid sökning. Försök igen senare.</p>';
    }
}

window.importMTGCard = async (cardId) => {
    try {
        const response = await fetch(`https://api.scryfall.com/cards/${cardId}`, {
            headers: {
                'User-Agent': 'FlowBooks/1.0',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Kunde inte hämta kortdata');
        }
        
        const card = await response.json();
        
        const productData = {
            name: card.name,
            type: 'MTG Card',
            description: card.oracle_text || '',
            imageUrl: card.image_uris?.normal || card.image_uris?.large || '',
            sku: card.collector_number + '-' + card.set.toUpperCase(),
            stock: 0,
            price: null,
            mtgData: {
                scryfall_id: card.id,
                mana_cost: card.mana_cost,
                type_line: card.type_line,
                set_name: card.set_name,
                set: card.set,
                collector_number: card.collector_number,
                rarity: card.rarity
            },
            companyId: currentCompany.id,
            createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, 'products'), productData);
        showToast(`${card.name} har importerats!`, 'success');
        
        await fetchAllCompanyData();
        renderProductsPage();
        closeModal();
    } catch (error) {
        console.error('Fel vid import av MTG-kort:', error);
        showToast('Kunde inte importera kortet.', 'error');
    }
}

async function importFromGoogleSheets() {
    const sheetsUrl = document.getElementById('google-sheets-url').value.trim();
    if (!sheetsUrl) {
        showToast('Ange en Google Sheets-URL.', 'error');
        return;
    }
    
    // Extrahera sheet ID från URL
    const sheetIdMatch = sheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
        showToast('Ogiltig Google Sheets-URL.', 'error');
        return;
    }
    
    const sheetId = sheetIdMatch[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    
    try {
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error('Kunde inte hämta data från Google Sheets');
        }
        
        const csvText = await response.text();
        const rows = csvText.split('\n').map(row => row.split(',').map(cell => cell.replace(/"/g, '').trim()));
        
        if (rows.length < 2) {
            showToast('Inga data hittades i arket.', 'error');
            return;
        }
        
        const headers = rows[0];
        const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('namn'));
        
        if (nameIndex === -1) {
            showToast('Kunde inte hitta en "name" eller "namn" kolumn.', 'error');
            return;
        }
        
        let importedCount = 0;
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[nameIndex] && row[nameIndex].trim()) {
                const cardName = row[nameIndex].trim();
                
                // Försök hämta kort från Scryfall
                try {
                    const searchResponse = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`, {
                        headers: {
                            'User-Agent': 'FlowBooks/1.0',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (searchResponse.ok) {
                        const card = await searchResponse.json();
                        
                        const productData = {
                            name: card.name,
                            type: 'MTG Card',
                            description: card.oracle_text || '',
                            imageUrl: card.image_uris?.normal || card.image_uris?.large || '',
                            sku: card.collector_number + '-' + card.set.toUpperCase(),
                            stock: 0,
                            price: null,
                            mtgData: {
                                scryfall_id: card.id,
                                mana_cost: card.mana_cost,
                                type_line: card.type_line,
                                set_name: card.set_name,
                                set: card.set,
                                collector_number: card.collector_number,
                                rarity: card.rarity
                            },
                            companyId: currentCompany.id,
                            createdAt: serverTimestamp()
                        };
                        
                        await addDoc(collection(db, 'products'), productData);
                        importedCount++;
                        
                        // Vänta lite mellan requests för att respektera rate limits
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } catch (cardError) {
                    console.warn(`Kunde inte importera kort: ${cardName}`, cardError);
                }
            }
        }
        
        showToast(`${importedCount} kort har importerats från Google Sheets!`, 'success');
        await fetchAllCompanyData();
        renderProductsPage();
        closeModal();
        
    } catch (error) {
        console.error('Fel vid import från Google Sheets:', error);
        showToast('Kunde inte importera från Google Sheets.', 'error');
    }
}

window.closeModal = () => {
    document.getElementById('modal-container').innerHTML = '';
}

// Kör appen
main();
