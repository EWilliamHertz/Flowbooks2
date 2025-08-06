import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

let currentUser;
let userData;

// ----- Huvudfunktioner -----
function main() {
    onAuthStateChanged(auth, async (user) => {
        if (user && user.emailVerified) {
            currentUser = user;
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                userData = userDocSnap.data();
                initializeAppUI();
            } else {
                await auth.signOut();
                window.location.href = 'login.html';
            }
        } else {
            window.location.href = 'login.html';
        }
    });
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
}

function navigateTo(page) {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-nav a[data-page="${page}"]`).classList.add('active');
    renderPageContent(page);
}

// ----- Sid-rendering -----
function renderPageContent(page) {
    const mainView = document.getElementById('main-view');
    const pageTitle = document.querySelector('.page-title');
    const newItemBtn = document.getElementById('new-item-btn');
    
    pageTitle.textContent = page;
    mainView.innerHTML = `<div class="card"><p>Laddar...</p></div>`;
    newItemBtn.style.display = 'none';

    switch (page) {
        case 'Översikt':
            renderDashboard();
            break;
        case 'Sammanfattning':
            renderSummaryPage();
            break;
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
        case 'Inställningar':
            renderSettingsPage();
            break;
        default:
            mainView.innerHTML = `<div class="card"><h3 class="card-title">Sidan hittades inte</h3></div>`;
    }
}

async function renderDashboard() {
    const mainView = document.getElementById('main-view');
    try {
        const incomeQuery = query(collection(db, 'incomes'), where('userId', '==', currentUser.uid));
        const expenseQuery = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid));
        const [incomeSnapshot, expenseSnapshot] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);
        const totalIncome = incomeSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const totalExpense = expenseSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const profit = totalIncome - totalExpense;

        mainView.innerHTML = `
            <div class="dashboard-grid">
                <div class="card text-center"><h3>Totala Intäkter</h3><p class="metric-value green">${totalIncome.toFixed(2)} kr</p></div>
                <div class="card text-center"><h3>Totala Utgifter</h3><p class="metric-value red">${totalExpense.toFixed(2)} kr</p></div>
                <div class="card text-center"><h3>Resultat</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toFixed(2)} kr</p></div>
            </div>`;
    } catch (error) {
        console.error("Fel vid laddning av dashboard:", error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda översikt</h3><p>Kontrollera att databasindex är korrekt skapade och att du har internetanslutning.</p></div>`;
    }
}

async function renderSummaryPage() {
    const mainView = document.getElementById('main-view');
    try {
        const incomeQuery = query(collection(db, 'incomes'), where('userId', '==', currentUser.uid));
        const expenseQuery = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid));
        const [incomeSnapshot, expenseSnapshot] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);

        const allTransactions = [];
        incomeSnapshot.forEach(doc => allTransactions.push({ type: 'income', ...doc.data() }));
        expenseSnapshot.forEach(doc => allTransactions.push({ type: 'expense', ...doc.data() }));

        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const rows = allTransactions.map(t => {
            const receiptCell = t.type === 'expense'
                ? (t.receiptUrl ? `<td><a href="${t.receiptUrl}" target="_blank" class="receipt-link">Visa</a></td>` : '<td>-</td>')
                : '';
            return `<tr class="transaction-row ${t.type}">
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td class="text-right ${t.type === 'income' ? 'green' : 'red'}">${t.type === 'income' ? '+' : '-'}${Number(t.amount).toFixed(2)} kr</td>
                ${receiptCell}
            </tr>`
        }).join('');

        const receiptHeader = '<th>Underlag</th>';
        mainView.innerHTML = `<div class="card"><h3 class="card-title">Transaktionshistorik</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th class="text-right">Summa</th>${receiptHeader}</tr></thead><tbody>${rows || '<tr><td colspan="4">Inga transaktioner att visa.</td></tr>'}</tbody></table></div>`;
    } catch (error) {
        console.error("Fel vid laddning av sammanfattning:", error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda sammanfattning</h3><p>Kontrollera att databasindex är korrekt skapade.</p></div>`;
    }
}


async function renderTransactionList(type) {
    const mainView = document.getElementById('main-view');
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    const title = type === 'income' ? 'Registrerade Intäkter' : 'Registrerade Utgifter';
    const party = type === 'income' ? 'Klient' : 'Leverantör';
    
    try {
        const q = query(collection(db, collectionName), where('userId', '==', currentUser.uid), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);

        const rows = snapshot.docs.map(doc => {
            const data = doc.data();
            const receiptCell = type === 'expense' 
                ? (data.receiptUrl ? `<td><a href="${data.receiptUrl}" target="_blank" class="receipt-link">Visa</a></td>` : '<td>-</td>') 
                : '';
            return `<tr><td>${data.date}</td><td>${data.description}</td><td>${data.party || ''}</td><td class="text-right">${Number(data.amount).toFixed(2)} kr</td>${receiptCell}</tr>`;
        }).join('');
        
        const receiptHeader = type === 'expense' ? '<th>Underlag</th>' : '';
        mainView.innerHTML = `<div class="card"><h3 class="card-title">${title}</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th>${party}</th><th class="text-right">Summa</th>${receiptHeader}</tr></thead><tbody>${rows || `<tr><td colspan="5">Inga transaktioner registrerade.</td></tr>`}</tbody></table></div>`;
    } catch (error) {
        console.error(`Fel vid laddning av ${collectionName}:`, error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda ${title}</h3><p>Kontrollera att databasindex är korrekt skapade för '${collectionName}'.</p></div>`;
    }
}

function renderTransactionForm(type) {
    const mainView = document.getElementById('main-view');
    const title = type === 'income' ? 'Registrera Ny Intäkt' : 'Registrera Ny Utgift';
    const partyLabel = type === 'income' ? 'Klient/Kund' : 'Leverantör';
    const today = new Date().toISOString().slice(0, 10);
    const fileUploadField = type === 'expense' ? `<div class="input-group"><label>Kvitto/Underlag (valfritt)</label><input id="trans-receipt" type="file" accept="image/*,.pdf"></div>` : '';

    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;"><h3 class="card-title">${title}</h3>
        <div class="input-group"><label>Datum</label><input id="trans-date" type="date" value="${today}"></div>
        <div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text"></div>
        <div class="input-group"><label>Kategori</label><input id="trans-cat" type="text"></div>
        <div class="input-group"><label>${partyLabel}</label><input id="trans-party" type="text"></div>
        <div class="input-group"><label>Summa (SEK)</label><input id="trans-amount" type="number" placeholder="0.00"></div>
        ${fileUploadField}
        <div style="display: flex; gap: 1rem; margin-top: 1rem;"><button id="cancel-btn" class="btn btn-secondary">Avbryt</button><button id="save-btn" class="btn btn-primary">Spara Transaktion</button></div></div>`;
    
    document.getElementById('save-btn').addEventListener('click', () => handleSave(type));
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter'));
}

// ----- Transaktionshantering & Bekräftelse -----
function handleSave(type) {
    const transactionData = {
        userId: currentUser.uid, createdAt: new Date(),
        date: document.getElementById('trans-date').value,
        description: document.getElementById('trans-desc').value,
        category: document.getElementById('trans-cat').value,
        party: document.getElementById('trans-party').value,
        amount: parseFloat(document.getElementById('trans-amount').value) || 0,
        receiptUrl: null
    };

    if (!transactionData.date || !transactionData.description || transactionData.amount <= 0) {
        alert('Vänligen fyll i datum, beskrivning och en summa större än noll.');
        return;
    }
    
    const receiptFile = type === 'expense' ? document.getElementById('trans-receipt').files[0] : null;

    showConfirmationModal(async () => {
        const saveButton = document.getElementById('modal-confirm');
        saveButton.disabled = true;
        saveButton.textContent = 'Sparar...';

        if (receiptFile) {
            try {
                const storageRef = ref(storage, `receipts/${currentUser.uid}/${Date.now()}-${receiptFile.name}`);
                await uploadBytes(storageRef, receiptFile);
                transactionData.receiptUrl = await getDownloadURL(storageRef);
            } catch (error) {
                console.error("Fel vid uppladdning:", error);
                alert("Kunde inte ladda upp kvittot, transaktionen avbröts.");
                return;
            }
        }
        await saveTransaction(type, transactionData);
    });
}

async function saveTransaction(type, data) {
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    try {
        await addDoc(collection(db, collectionName), data);
        navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
    } catch (error) {
        alert("Kunde inte spara transaktionen. Försök igen.");
    }
}

function showConfirmationModal(onConfirm) {
    const container = document.getElementById('confirmation-modal-container');
    container.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>Bekräfta Bokföring</h3>
        <p>Var vänlig bekräfta denna bokföringspost. Enligt Bokföringslagen är detta en slutgiltig aktion. Posten kan inte ändras eller raderas i efterhand.</p>
        <div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">Avbryt</button><button id="modal-confirm" class="btn btn-primary">Bekräfta och Bokför</button></div>
        </div></div>`;

    document.getElementById('modal-confirm').onclick = () => onConfirm();
    document.getElementById('modal-cancel').onclick = () => { container.innerHTML = ''; };
}

// ----- Inställningar -----
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
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    
    await updateDoc(doc(db, 'users', currentUser.uid), { profileImageURL: url });
    userData.profileImageURL = url;
    updateProfileIcon();
    alert('Profilbilden är uppdaterad!');
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value;
    if (!newName) return;
    
    await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
    userData.companyName = newName;
    updateProfileIcon();
    alert('Företagsinformationen är sparad!');
}

async function deleteAccount() {
    if (prompt("Är du helt säker? Skriv 'RADERA' för att bekräfta.") === 'RADERA') {
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid));
            await auth.currentUser.delete();
            window.location.href = 'login.html';
        } catch (error) {
            alert("Kunde inte ta bort kontot. Du kan behöva logga ut och in igen för att göra detta.");
        }
    }
}

// Kör appen
main();
