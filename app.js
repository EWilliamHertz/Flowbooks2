import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
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
            if (userDocSnap.exists() && userDocSnap.data().companyId) {
                userData = userDocSnap.data();
                await fetchAllCompanyData();
                initializeAppUI();
            } else {
                showFatalError("Ditt konto är inte korrekt kopplat till ett företag eller saknas i databasen.");
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}

async function fetchAllCompanyData() {
    try {
        const incomeQuery = query(collection(db, 'incomes'), where('companyId', '==', userData.companyId));
        const expenseQuery = query(collection(db, 'expenses'), where('companyId', '==', userData.companyId));
        const [incomeSnapshot, expenseSnapshot] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);
        
        allIncomes = incomeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allExpenses = expenseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        allTransactions = [
            ...allIncomes.map(t => ({ ...t, type: 'income' })),
            ...allExpenses.map(t => ({ ...t, type: 'expense' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

    } catch (error) {
        console.error("Kunde inte hämta företagsdata:", error);
        showToast("Kunde inte ladda all företagsdata.", "error");
    }
}

function initializeAppUI() {
    updateProfileIcon();
    setupEventListeners();
    navigateTo('Översikt');
    document.getElementById('app-container').style.visibility = 'visible';
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
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (link) link.classList.add('active');
    renderPageContent(page);
    document.querySelector('.sidebar').classList.remove('open'); // Stäng menyn vid navigering
}

// ----- SID-RENDERING -----
function renderPageContent(page) {
    const mainView = document.getElementById('main-view');
    const pageTitle = document.querySelector('.page-title');
    const newItemBtn = document.getElementById('new-item-btn');
    
    pageTitle.textContent = page;
    mainView.innerHTML = `<div class="card">${renderSpinner()}</div>`;
    newItemBtn.style.display = 'none';

    switch (page) {
        case 'Översikt': renderDashboard(); break;
        case 'Sammanfattning': renderSummaryPage(); break;
        case 'Rapporter': renderReportsPage(); break;
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
        case 'Inställningar': renderSettingsPage(); break;
        default: mainView.innerHTML = `<div class="card"><h3 class="card-title">Sidan hittades inte</h3></div>`;
    }
}

// ----- NYTT: SÖK & FILTER FUNKTIONER -----
function getControlsHTML() {
    return `
        <div class="controls-container">
            <div class="search-container">
                <input type="text" id="search-input" placeholder="Sök på beskrivning eller motpart...">
            </div>
            <div class="filter-container">
                <button class="btn filter-btn active" data-period="all">Alla</button>
                <button class="btn filter-btn" data-period="this-month">Denna månad</button>
                <button class="btn filter-btn" data-period="last-month">Förra månaden</button>
            </div>
        </div>
    `;
}

function applyFiltersAndRender(list, type) {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const activeFilterEl = document.querySelector('.filter-btn.active');
    const activeFilter = activeFilterEl ? activeFilterEl.dataset.period : 'all';

    let filteredList = list;

    // Sökfilter
    if (searchTerm) {
        filteredList = filteredList.filter(t => 
            t.description.toLowerCase().includes(searchTerm) ||
            (t.party && t.party.toLowerCase().includes(searchTerm))
        );
    }

    // Datumfilter
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

    if (type === 'summary') {
        const rows = transactions.map(t => {
            const actionCell = t.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${t.id}" data-type="${t.type}">Korrigera</button></td>`;
            return `<tr class="transaction-row ${t.type} ${t.isCorrection ? 'corrected' : ''}"><td>${t.date}</td><td>${t.description}</td><td>${t.party || ''}</td><td class="text-right ${t.type === 'income' ? 'green' : 'red'}">${Number(t.amount).toFixed(2)} kr</td>${actionCell}</tr>`;
        }).join('');
        container.innerHTML = `<table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Motpart</th><th class="text-right">Summa</th><th>Åtgärd</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Inga transaktioner att visa.</td></tr>'}</tbody></table>`;
    } else {
        const rows = transactions.map(data => {
            const actionCell = data.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${data.id}" data-type="${type}">Korrigera</button></td>`;
            const attachmentCell = data.attachmentUrl ? `<td><a href="${data.attachmentUrl}" target="_blank" class="receipt-link">Visa</a></td>` : '<td>-</td>';
            return `<tr class="${data.isCorrection ? 'corrected' : ''}"><td>${data.date}</td><td>${data.description}</td><td>${data.party || ''}</td><td class="text-right">${Number(data.amount).toFixed(2)} kr</td>${attachmentCell}<td>${actionCell}</td></tr>`;
        }).join('');
        container.innerHTML = `<table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Motpart</th><th class="text-right">Summa</th><th>Underlag</th><th>Åtgärd</th></tr></thead><tbody>${rows || `<tr><td colspan="6">Inga transaktioner att visa.</td></tr>`}</tbody></table>`;
    }

    container.querySelectorAll('.btn-correction').forEach(btn => {
        btn.addEventListener('click', (e) => renderCorrectionForm(e.target.dataset.type, e.target.dataset.id));
    });
}


// ----- SID-RENDERINGSFUNKTIONER -----

function renderDashboard() {
    const mainView = document.getElementById('main-view');
    const totalIncome = allIncomes.reduce((sum, doc) => sum + doc.amount, 0);
    const totalExpense = allExpenses.reduce((sum, doc) => sum + doc.amount, 0);
    const profit = totalIncome - totalExpense;
    mainView.innerHTML = `<div class="dashboard-grid"><div class="card text-center"><h3>Totala Intäkter</h3><p class="metric-value green">${totalIncome.toFixed(2)} kr</p></div><div class="card text-center"><h3>Totala Utgifter</h3><p class="metric-value red">${totalExpense.toFixed(2)} kr</p></div><div class="card text-center"><h3>Resultat</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toFixed(2)} kr</p></div></div>`;
}

function renderSummaryPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="card"><h3 class="card-title">Transaktionshistorik</h3>${getControlsHTML()}<div id="table-container">${renderSpinner()}</div></div>`;
    
    // Initial rendering and setup of event listeners
    applyFiltersAndRender(allTransactions, 'summary');
    
    document.getElementById('search-input').addEventListener('input', () => applyFiltersAndRender(allTransactions, 'summary'));
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            applyFiltersAndRender(allTransactions, 'summary');
        });
    });
}

function renderTransactionList(type) {
    const mainView = document.getElementById('main-view');
    const title = type === 'income' ? 'Registrerade Intäkter' : 'Registrerade Utgifter';
    const dataToList = type === 'income' ? allIncomes : allExpenses;
    mainView.innerHTML = `<div class="card"><h3 class="card-title">${title}</h3>${getControlsHTML()}<div id="table-container">${renderSpinner()}</div></div>`;
    
    // Initial rendering and setup of event listeners
    applyFiltersAndRender(dataToList, type);
    
    document.getElementById('search-input').addEventListener('input', () => applyFiltersAndRender(dataToList, type));
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            applyFiltersAndRender(dataToList, type);
        });
    });
}
// ----- Resten av koden är oförändrad -----
// ... (Google Drive, Import, Formulär, Inställningar etc.) ...
// ----- GOOGLE DRIVE & IMPORT -----

function initializeGisClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
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
    const picker = new google.picker.PickerBuilder()
        .setAppId(GOOGLE_APP_ID)
        .setOAuthToken(gapi.client.getToken().access_token)
        .addView(view)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}

async function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs[0];
        const fileId = doc.id;
        let fileContent;
        try {
            if (doc.mimeType === 'application/vnd.google-apps.spreadsheet') {
                const response = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: fileId, range: 'A:E',
                });
                const rows = response.result.values || [];
                fileContent = rows.map(row => row.join(',')).join('\n');
            } else {
                const response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media' });
                fileContent = response.body;
            }
            processFileContent(fileContent);
        } catch (error) {
            console.error("Fel vid hämtning av fil från Google Drive:", error);
            showToast("Kunde inte hämta filen från Google Drive.", "error");
        }
    }
}

function renderImportPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="card"><h3 class="card-title">Importera Transaktioner</h3><p>Ladda upp en CSV-fil. Den måste innehålla kolumnerna: <strong>Datum, Typ, Beskrivning, Motpart, Summa (SEK)</strong>.</p><hr style="margin: 1rem 0;"><h4>Alternativ 1: Ladda upp fil från din enhet</h4><input type="file" id="csv-file-input" accept=".csv" style="display: block; margin-top: 1rem;"><hr style="margin: 1.5rem 0;"><h4>Alternativ 2: Importera från Google Drive</h4><button id="google-drive-import-btn" class="btn btn-secondary">Välj fil från Google Drive</button></div>`;
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
            showToast("Inga giltiga transaktioner hittades i filen.", "warning");
        }
    } catch (error) {
        showToast(`Fel vid läsning av fil: ${error.message}`, "error");
        console.error("CSV Parse Error:", error);
    }
}

function parseCSV(text) {
    const lines = text.split(/\r\n|\n/);
    const header = lines[0].split(',').map(h => h.trim());
    const requiredHeaders = ['Datum', 'Typ', 'Beskrivning', 'Motpart', 'Summa (SEK)'];
    const idx = { date: header.indexOf(requiredHeaders[0]), type: header.indexOf(requiredHeaders[1]), description: header.indexOf(requiredHeaders[2]), party: header.indexOf(requiredHeaders[3]), amount: header.indexOf(requiredHeaders[4]) };
    if (Object.values(idx).some(i => i === -1)) { throw new Error(`Filen saknar obligatoriska kolumner: ${requiredHeaders.join(', ')}`); }
    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const data = lines[i].split(',');
        const type = data[idx.type]?.trim();
        if (type !== 'Intäkt' && type !== 'Utgift') continue;
        const amountStr = data[idx.amount]?.replace(/"/g, '').replace(/\s/g, '').replace(',', '.');
        const amount = parseFloat(amountStr);
        if (isNaN(amount)) continue;
        transactions.push({ date: data[idx.date]?.trim(), type: type, description: data[idx.description]?.trim(), party: data[idx.party]?.trim() || '', amount: Math.abs(amount), id: `import-${i}` });
    }
    return transactions;
}

function showImportConfirmationModal(transactions) {
    const modalContainer = document.getElementById('modal-container');
    const transactionRows = transactions.map(t => `
        <tr class="import-row">
            <td><input type="checkbox" class="import-checkbox" data-transaction-id="${t.id}" checked></td>
            <td>${t.date}</td>
            <td>${t.description}</td>
            <td>${t.party}</td>
            <td class="${t.type === 'Intäkt' ? 'green' : 'red'}">${t.type}</td>
            <td class="text-right">${t.amount.toFixed(2)} kr</td>
        </tr>
    `).join('');
    modalContainer.innerHTML = `<div class="modal-overlay"><div class="modal-content" style="max-width: 900px;"><h3>Granska och bekräfta import</h3><p>Verifiera transaktionerna nedan. Bocka ur de du inte vill importera.</p><div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--border-radius); margin-bottom: 1rem;"><table class="data-table"><thead><tr><th><input type="checkbox" id="select-all-checkbox" checked></th><th>Datum</th><th>Beskrivning</th><th>Motpart</th><th>Typ</th><th class="text-right">Summa</th></tr></thead><tbody>${transactionRows}</tbody></table></div><div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">Avbryt</button><button id="modal-confirm-import" class="btn btn-primary">Importera valda</button></div></div></div>`;
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
                const dataToSave = { date: t.date, description: t.description, party: t.party, amount: t.amount, userId: currentUser.uid, companyId: userData.companyId, createdAt: new Date(), isCorrection: false, attachmentUrl: null };
                batch.set(docRef, dataToSave);
            });
            await batch.commit();
            await fetchAllCompanyData();
            showToast(`${transactionsToSave.length} transaktioner har importerats!`, 'success');
            modalContainer.innerHTML = '';
            navigateTo('Sammanfattning');
        } catch (error) {
            console.error("Fel vid import:", error);
            showToast("Ett fel uppstod vid import.", "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Importera valda';
        }
    });
}

// ----- TRANSAKTIONER & FORMULÄR -----
function renderTransactionForm(type, originalData = {}, isCorrection = false, originalId = null) {
    const mainView = document.getElementById('main-view');
    const title = isCorrection ? 'Korrigera Transaktion' : `Registrera Ny ${type === 'income' ? 'Intäkt' : 'Utgift'}`;
    const today = new Date().toISOString().slice(0, 10);
    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;"><h3 class="card-title">${title}</h3>${isCorrection ? `<p class="correction-notice">Du skapar nu en rättelsepost.</p>` : ''}<div class="input-group"><label>Datum</label><input id="trans-date" type="date" value="${originalData.date || today}"></div><div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text" value="${originalData.description || ''}"></div><div class="input-group"><label>Motpart (Kund/Leverantör)</label><input id="trans-party" type="text" value="${originalData.party || ''}"></div><div class="input-group"><label>Summa (SEK)</label><input id="trans-amount" type="number" placeholder="0.00" value="${originalData.amount || ''}"></div><div class="input-group"><label>Underlag (valfritt)</label><input id="trans-attachment" type="file" accept="image/*,.pdf"></div><div style="display: flex; gap: 1rem; margin-top: 1rem;"><button id="cancel-btn" class="btn btn-secondary">Avbryt</button><button id="save-btn" class="btn btn-primary">${isCorrection ? 'Spara Rättelse' : 'Spara'}</button></div></div>`;
    document.getElementById('save-btn').addEventListener('click', () => {
        const newData = { date: document.getElementById('trans-date').value, description: document.getElementById('trans-desc').value, party: document.getElementById('trans-party').value, amount: parseFloat(document.getElementById('trans-amount').value) || 0 };
        if (isCorrection) { handleCorrectionSave(type, originalId, originalData, newData); } else { handleSave(type, newData); }
    });
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter'));
}

async function handleSave(type, data) {
    const attachmentFile = document.getElementById('trans-attachment').files[0];
    const transactionData = { ...data, userId: currentUser.uid, companyId: userData.companyId, createdAt: new Date(), isCorrection: false, attachmentUrl: null };
    if (!transactionData.date || !transactionData.description || transactionData.amount === 0) {
        showToast('Fyll i datum, beskrivning och en summa.', 'warning');
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
                return;
            }
        }
        await saveTransaction(type, transactionData);
    }, "Bekräfta Bokföring", "Var vänlig bekräfta denna bokföringspost. Enligt Bokföringslagen är detta en slutgiltig aktion.");
}

async function handleCorrectionSave(type, originalId, originalData, newData) {
    if (!newData.date || !newData.description || newData.amount === 0) {
        showToast('Fyll i alla fält korrekt för den nya posten.', 'warning');
        return;
    }
    showConfirmationModal(async () => {
        const batch = writeBatch(db);
        const collectionName = type === 'income' ? 'incomes' : 'expenses';
        const originalDocRef = doc(db, collectionName, originalId);
        batch.update(originalDocRef, { isCorrection: true });
        const reversalPost = { ...originalData, amount: -originalData.amount, isCorrection: true, correctedPostId: originalId, description: `Rättelse av: ${originalData.description}`, createdAt: new Date() };
        const reversalDocRef = doc(collection(db, collectionName));
        batch.set(reversalDocRef, reversalPost);
        const newPost = { ...newData, userId: currentUser.uid, companyId: userData.companyId, createdAt: new Date(), isCorrection: false, correctsPostId: originalId };
        const newDocRef = doc(collection(db, collectionName));
        batch.set(newDocRef, newPost);
        await batch.commit();
        await fetchAllCompanyData();
        navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
        showToast("Rättelsen har sparats.", "success");
    }, "Bekräfta Rättelse", "Du är på väg att skapa en rättelsepost. Detta kan inte ångras.");
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
        showToast("Kunde inte spara transaktionen.", "error");
    }
}

function showConfirmationModal(onConfirm, title, message) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>${title}</h3><p>${message}</p><div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">Avbryt</button><button id="modal-confirm" class="btn btn-primary">Bekräfta</button></div></div></div>`;
    document.getElementById('modal-confirm').onclick = () => { onConfirm(); };
    document.getElementById('modal-cancel').onclick = () => { container.innerHTML = ''; };
}

// ----- INSTÄLLNINGAR & PROFIL -----
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
    mainView.innerHTML = `<div class="settings-grid"><div class="card"><h3>Profilbild</h3><p>Ladda upp en profilbild eller logotyp.</p><input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;"><button id="save-pic" class="btn btn-primary">Spara Bild</button></div><div class="card"><h3>Företagsinformation</h3><div class="input-group"><label>Företagsnamn</label><input id="setting-company" value="${userData.companyName || ''}"></div><button id="save-company" class="btn btn-primary">Spara</button></div><div class="card card-danger"><h3>Ta bort konto</h3><p>All din data raderas permanent. Detta kan inte ångras.</p><button id="delete-account" class="btn btn-danger">Ta bort kontot permanent</button></div></div>`;
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
        console.error("Fel vid uppladdning av profilbild:", error);
        showToast("Kunde inte spara profilbilden.", "error");
    }
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value;
    if (!newName) return;
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        userData.companyName = newName;
        updateProfileIcon();
        showToast('Företagsinformationen är sparad!', 'success');
    } catch (error) {
        console.error("Fel vid sparning av företagsnamn:", error);
        showToast("Kunde inte spara företagsnamnet.", "error");
    }
}

async function deleteAccount() {
    if (prompt("Är du helt säker? Skriv 'RADERA' för att bekräfta.") === 'RADERA') {
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid));
            await auth.currentUser.delete();
            showToast("Ditt konto har tagits bort.", "info");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning av konto:", error);
            showToast("Kunde inte ta bort kontot. Logga ut och in igen.", "error");
        }
    }
}

// Kör appen
main();
