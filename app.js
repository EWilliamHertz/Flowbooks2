import { auth, db, storage } from './firebase-config.js';

// --- Globala variabler och State ---
let currentUser;
let userData;

// --- Huvudfunktion som körs när sidan laddas ---
async function main() {
    auth.onAuthStateChanged(async user => {
        if (user && user.emailVerified) {
            currentUser = user;
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                userData = userDoc.data();
            } else {
                // Hantera fall där användardokument saknas
                window.location.href = 'login.html';
                return;
            }
            initializeAppUI();
            navigateTo('Översikt');
            document.getElementById('app-container').style.visibility = 'visible';
        } else {
            window.location.href = 'login.html';
        }
    });
}

// --- Funktioner för att bygga UI och hantera events ---
function initializeAppUI() {
    const initial = userData?.companyName ? userData.companyName.charAt(0).toUpperCase() : '?';
    const profileIcon = document.getElementById('user-profile-icon');
    if (userData?.profileImageURL) {
        profileIcon.style.backgroundImage = `url(${userData.profileImageURL})`;
    } else {
        profileIcon.textContent = initial;
    }

    document.querySelector('.sidebar-nav').addEventListener('click', e => {
        if (e.target.tagName === 'A') {
            e.preventDefault();
            navigateTo(e.target.dataset.page);
        }
    });

    profileIcon.addEventListener('click', () => {
        document.getElementById('profile-dropdown').classList.toggle('show');
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        auth.signOut();
    });

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

function renderPageContent(page) {
    const mainView = document.getElementById('main-view');
    const pageTitle = document.querySelector('.page-title');
    const newItemBtn = document.getElementById('new-item-btn');
    
    pageTitle.textContent = page;
    mainView.innerHTML = '';
    newItemBtn.style.display = 'none';

    switch (page) {
        case 'Översikt':
            renderDashboard(mainView);
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
            mainView.innerHTML = `<div class="card"><h3 class="card-title">Under utveckling</h3><p>Sidan '${page}' och dess funktioner är under utveckling och kommer snart.</p></div>`;
    }
}

// NY FUNKTION: Renderar en informativ dashboard
function renderDashboard(container) {
    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="card card-full-width">
                <h3 class="card-title">Välkommen till FlowBooks!</h3>
                <p>Här är en översikt av funktionerna som hjälper dig att hantera din bokföring på 15 minuter i månaden. Utforska och kom igång direkt.</p>
            </div>
            <div class="card">
                <h3 class="card-title">AI-driven Kvittohantering</h3>
                <p>Gå till 'Utgifter' för att ladda upp en bild på ett kvitto. Vår hemsida använder AI-tolkning för att automatiskt läsa av och kategorisera dina utlägg.</p>
            </div>
            <div class="card">
                <h3 class="card-title">Enkel Fakturering</h3>
                <p>Skapa och skicka professionella fakturor med automatiska betalningspåminnelser. Denna funktion är snart tillgänglig.</p>
            </div>
            <div class="card">
                <h3 class="card-title">Automatisk Bankavstämning</h3>
                <p>Koppla ditt bankkonto för att automatiskt matcha transaktioner mot fakturor och kvitton. Denna funktion är snart tillgänglig.</p>
            </div>
             <div class="card">
                <h3 class="card-title">Momsrapporter med ett klick</h3>
                <p>Systemet kommer automatiskt generera dina momsrapporter baserat på din bokföring, redo att skickas in till Skatteverket.</p>
            </div>
        </div>
    `;
}

async function renderExpenseList() {
    const mainView = document.getElementById('main-view');
    const expensesRef = db.collection('expenses').where('userId', '==', currentUser.uid).orderBy('date', 'desc');
    const snapshot = await expensesRef.get();
    let rows = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        rows += `<tr><td>${data.date}</td><td>${data.description}</td><td>${data.amount.toFixed(2)} kr</td></tr>`;
    });
    mainView.innerHTML = `<div class="card"><h3 class="card-title">Registrerade Utgifter</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Belopp</th></tr></thead><tbody>${rows || '<tr><td colspan=3>Inga utgifter registrerade. Klicka på "Ny Utgift" för att börja.</td></tr>'}</tbody></table></div>`;
}

function renderExpenseForm() {
    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;">
        <h3 class="card-title">Registrera Ny Utgift</h3>
        <p>Fyll i detaljerna nedan. Snart kommer du kunna ladda upp en bild på kvittot direkt!</p>
        <div class="input-group"><label for="expense-date">Datum</label><input id="expense-date" type="date" value="${today}"></div>
        <div class="input-group"><label for="expense-desc">Beskrivning</label><input id="expense-desc" type="text" placeholder="t.ex. Kaffe med kund"></div>
        <div class="input-group"><label for="expense-amount">Belopp (SEK)</label><input id="expense-amount" type="number" placeholder="150.00"></div>
        <div style="display: flex; gap: 1rem; margin-top: 1rem;">
             <button id="cancel-expense" class="btn btn-secondary">Avbryt</button>
             <button id="save-expense" class="btn btn-primary">Spara Utgift</button>
        </div>
    </div>`;
    document.getElementById('save-expense').addEventListener('click', saveExpense);
    document.getElementById('cancel-expense').addEventListener('click', () => navigateTo('Utgifter'));
}

async function saveExpense() {
    const expense = {
        userId: currentUser.uid,
        date: document.getElementById('expense-date').value,
        description: document.getElementById('expense-desc').value,
        amount: parseFloat(document.getElementById('expense-amount').value)
    };
    if (!expense.date || !expense.description || isNaN(expense.amount)) {
        alert('Alla fält måste vara korrekt ifyllda.');
        return;
    }
    await db.collection('expenses').add(expense);
    navigateTo('Utgifter');
}

function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="settings-grid">
        <div class="card"><h3>Profilbild</h3><p>Ladda upp en profilbild eller logotyp för ditt företag.</p><input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;"><button id="save-pic" class="btn btn-primary">Spara Bild</button></div>
        <div class="card"><h3>Företagsinformation</h3><div class="input-group"><label>Företagsnamn</label><input id="setting-company" value="${userData.companyName || ''}"></div><button id="save-company" class="btn btn-primary">Spara</button></div>
        <div class="card card-danger"><h3>Ta bort konto</h3><p>All din data, inklusive utgifter och inställningar, kommer raderas permanent. Detta kan inte ångras.</p><button id="delete-account" class="btn btn-danger">Ta bort kontot permanent</button></div>
    </div>`;
    document.getElementById('save-pic').addEventListener('click', saveProfileImage);
    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
}

async function saveProfileImage() {
    const fileInput = document.getElementById('profile-pic-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert("Välj en fil att ladda upp.");
        return;
    }
    const filePath = `profile_images/${currentUser.uid}/${file.name}`;
    const fileRef = storage.ref(filePath);
    try {
        await fileRef.put(file);
        const url = await fileRef.getDownloadURL();
        await db.collection('users').doc(currentUser.uid).update({ profileImageURL: url });
        document.getElementById('user-profile-icon').style.backgroundImage = `url(${url})`;
        document.getElementById('user-profile-icon').textContent = '';
        userData.profileImageURL = url;
        alert('Profilbilden är uppdaterad!');
    } catch (error) {
        console.error("Fel vid uppladdning av bild:", error);
        alert("Ett fel uppstod. Kunde inte ladda upp bilden.");
    }
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value;
    if (!newName) {
        alert("Företagsnamn kan inte vara tomt.");
        return;
    }
    try {
        await db.collection('users').doc(currentUser.uid).update({ companyName: newName });
        userData.companyName = newName;
        alert('Företagsinformationen är sparad!');
    } catch (error) {
        console.error("Kunde inte spara företagsinformation:", error);
        alert("Ett fel uppstod.");
    }
}

async function deleteAccount() {
    const confirmation = prompt("Är du helt säker? Detta raderar all din data permanent. Skriv 'RADERA' för att bekräfta.");
    if (confirmation === 'RADERA') {
        try {
            await db.collection('users').doc(currentUser.uid).delete();
            await currentUser.delete();
            alert("Ditt konto och all tillhörande data har tagits bort. Du kommer nu att loggas ut.");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning av konto:", error);
            alert("Kunde inte ta bort kontot. Du kan behöva logga ut och in igen för att slutföra denna åtgärd.");
        }
    } else {
        alert("Borttagningen avbröts.");
    }
}

// --- Kör appen ---
main();
