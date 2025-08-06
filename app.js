import { auth, db, storage } from './firebase-config.js';

// --- Globala variabler och State ---
let currentUser;
let userData;

// --- Huvudfunktion som körs när sidan laddas ---
async function main() {
    // Vänta tills vi vet vem användaren är
    auth.onAuthStateChanged(async user => {
        if (user && user.emailVerified) {
            currentUser = user;
            const userDoc = await db.collection('users').doc(user.uid).get();
            userData = userDoc.data();
            
            // Nu när vi har all data kan vi starta appen
            initializeAppUI();
            navigateTo('Översikt');
            document.getElementById('app-container').style.visibility = 'visible';
        }
    });
}

// --- Funktioner för att bygga UI och hantera events ---
function initializeAppUI() {
    // Ladda profilbild/initial
    const initial = userData?.companyName ? userData.companyName.charAt(0).toUpperCase() : '?';
    const profileIcon = document.getElementById('user-profile-icon');
    if (userData?.profileImageURL) {
        profileIcon.style.backgroundImage = `url(${userData.profileImageURL})`;
    } else {
        profileIcon.textContent = initial;
    }

    // Event listeners
    document.querySelector('.sidebar-nav').addEventListener('click', e => {
        if (e.target.tagName === 'A') {
            e.preventDefault();
            navigateTo(e.target.dataset.page);
        }
    });

    profileIcon.addEventListener('click', () => {
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
    // Uppdatera aktiv länk
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-nav a[data-page="${page}"]`).classList.add('active');
    
    // Rendera rätt innehåll
    renderPageContent(page);
}

function renderPageContent(page) {
    const mainView = document.getElementById('main-view');
    const pageTitle = document.querySelector('.page-title');
    const newItemBtn = document.getElementById('new-item-btn');
    
    pageTitle.textContent = page;
    mainView.innerHTML = '';
    newItemBtn.style.display = 'none'; // Göm knappen som standard

    switch (page) {
        case 'Översikt':
            mainView.innerHTML = `<div class="card"><h3 class="card-title">Dashboard</h3><p>Under utveckling.</p></div>`;
            break;
        case 'Utgifter':
            newItemBtn.textContent = 'Ny Utgift';
            newItemBtn.style.display = 'block';
            newItemBtn.onclick = renderExpenseForm;
            renderExpenseList();
            break;
        case 'Inställningar':
            renderSettingsPage();
            break;
        default:
            mainView.innerHTML = `<div class="card"><p>Sidan ${page} är under utveckling.</p></div>`;
    }
}

async function renderExpenseList() {
    const mainView = document.getElementById('main-view');
    const expensesRef = db.collection('expenses').where('userId', '==', currentUser.uid);
    const snapshot = await expensesRef.get();
    let rows = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        rows += `<tr><td>${data.date}</td><td>${data.description}</td><td>${data.amount} kr</td></tr>`;
    });
    mainView.innerHTML = `<div class="card"><h3>Registrerade Utgifter</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Belopp</th></tr></thead><tbody>${rows || '<tr><td colspan=3>Inga utgifter.</td></tr>'}</tbody></table></div>`;
}

function renderExpenseForm() {
    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    mainView.innerHTML = `<div class="card"><h3>Ny Utgift</h3>
        <div class="input-group"><label>Datum</label><input id="expense-date" type="date" value="${today}"></div>
        <div class="input-group"><label>Beskrivning</label><input id="expense-desc" type="text"></div>
        <div class="input-group"><label>Belopp</label><input id="expense-amount" type="number"></div>
        <button id="save-expense" class="btn btn-primary">Spara</button>
    </div>`;
    document.getElementById('save-expense').addEventListener('click', saveExpense);
}

async function saveExpense() {
    const expense = {
        userId: currentUser.uid,
        date: document.getElementById('expense-date').value,
        description: document.getElementById('expense-desc').value,
        amount: parseFloat(document.getElementById('expense-amount').value)
    };
    if (!expense.date || !expense.description || isNaN(expense.amount)) {
        alert('Fyll i alla fält.');
        return;
    }
    await db.collection('expenses').add(expense);
    navigateTo('Utgifter');
}

function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="settings-grid">
        <div class="card"><h3>Profilbild</h3><input type="file" id="profile-pic-upload"><button id="save-pic" class="btn btn-primary">Spara Bild</button></div>
        <div class="card"><h3>Företagsinformation</h3><div class="input-group"><label>Företagsnamn</label><input id="setting-company" value="${userData.companyName || ''}"></div><button id="save-company" class="btn btn-primary">Spara</button></div>
        <div class="card"><h3>Ta bort konto</h3><p>Detta kan inte ångras.</p><button id="delete-account" class="btn btn-danger">Ta bort konto</button></div>
    </div>`;
    document.getElementById('save-pic').addEventListener('click', saveProfileImage);
    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
}

async function saveProfileImage() { /* ... logik ... */ }
async function saveCompanyInfo() { /* ... logik ... */ }
async function deleteAccount() { /* ... logik ... */ }


// --- Kör appen ---
main();

