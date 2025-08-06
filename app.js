// Importera nödvändiga funktioner från Firebase SDK (modern v9-syntax)
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { app } from './firebase-config.js';

// Initiera Firebase-tjänster
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Globala variabler
let currentUser;
let userData;

// Huvudfunktion som körs när appen startar
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
                // Om användardata saknas i databasen, logga ut och skicka till login.
                console.error("Hittade inte användardata i Firestore för en inloggad användare.");
                await auth.signOut();
                window.location.href = 'login.html';
            }
        } else {
            // Om ingen användare är inloggad eller verifierad, skicka till login-sidan
            window.location.href = 'login.html';
        }
    });
}

// Initierar gränssnittet efter att data har laddats
function initializeAppUI() {
    updateProfileIcon();
    setupEventListeners();
    navigateTo('Översikt');
    document.getElementById('app-container').style.visibility = 'visible';
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

    document.getElementById('logout-btn').addEventListener('click', () => {
        auth.signOut();
    });

    document.getElementById('settings-link').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('profile-dropdown').classList.remove('show');
        navigateTo('Inställningar');
    });
}

// Navigerar mellan olika vyer i appen
function navigateTo(page) {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-nav a[data-page="${page}"]`).classList.add('active');
    renderPageContent(page);
}

// Renderar innehållet för den valda vyn
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
            newItemBtn.onclick = () => renderExpenseForm();
            renderExpenseList();
            break;
        case 'Inställningar':
            renderSettingsPage();
            break;
        default:
            mainView.innerHTML = `<div class="card"><h3 class="card-title">Under utveckling</h3><p>Sidan '${page}' och dess funktioner är under utveckling.</p></div>`;
    }
}

function renderDashboard(container) {
    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="card card-full-width">
                <h3 class="card-title">Välkommen, ${userData.companyName}!</h3>
                <p>Här är din översikt. Utforska funktionerna i menyn för att hantera din bokföring på 15 minuter i månaden.</p>
            </div>
            <div class="card">
                <h3 class="card-title">Registrera Utgifter</h3>
                <p>Gå till 'Utgifter' för att lägga till kvitton och andra utlägg. Snart kan du ladda upp bilder direkt för automatisk AI-tolkning.</p>
            </div>
            <div class="card">
                <h3 class="card-title">Hantera Inställningar</h3>
                <p>Gå till 'Inställningar' för att uppdatera ditt företagsnamn, ladda upp en logotyp eller hantera ditt konto.</p>
            </div>
        </div>`;
}

async function renderExpenseList() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="card"><h3 class="card-title">Laddar utgifter...</h3></div>`; // Placeholder
    
    const expensesCol = collection(db, 'expenses');
    const q = query(expensesCol, where('userId', '==', currentUser.uid), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    let rows = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        rows += `<tr><td>${data.date}</td><td>${data.description}</td><td>${Number(data.amount).toFixed(2)} kr</td></tr>`;
    });

    const tableHTML = `<div class="card"><h3 class="card-title">Registrerade Utgifter</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Belopp</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Inga utgifter registrerade. Klicka på "Ny Utgift" för att börja.</td></tr>'}</tbody></table></div>`;
    mainView.innerHTML = tableHTML;
}

function renderExpenseForm() {
    const mainView = document.getElementById('main-view');
    const today = new Date().toISOString().slice(0, 10);
    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;">
        <h3 class="card-title">Registrera Ny Utgift</h3>
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
        amount: parseFloat(document.getElementById('expense-amount').value) || 0
    };
    if (!expense.date || !expense.description || expense.amount <= 0) {
        alert('Alla fält måste vara korrekt ifyllda.');
        return;
    }
    await addDoc(collection(db, 'expenses'), expense);
    navigateTo('Utgifter');
}

function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="settings-grid">
        <div class="card"><h3>Profilbild</h3><p>Ladda upp en profilbild eller logotyp.</p><input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;"><button id="save-pic" class="btn btn-primary">Spara Bild</button></div>
        <div class="card"><h3>Företagsinformation</h3><div class="input-group"><label>Företagsnamn</label><input id="setting-company" value="${userData.companyName || ''}"></div><button id="save-company" class="btn btn-primary">Spara</button></div>
        <div class="card card-danger"><h3>Ta bort konto</h3><p>All din data, inklusive utgifter och inställningar, raderas permanent. Detta kan inte ångras.</p><button id="delete-account" class="btn btn-danger">Ta bort kontot permanent</button></div>
    </div>`;
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
    
    const userDocRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userDocRef, { profileImageURL: url });

    userData.profileImageURL = url;
    updateProfileIcon();
    alert('Profilbilden är uppdaterad!');
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value;
    if (!newName) return;
    
    const userDocRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userDocRef, { companyName: newName });

    userData.companyName = newName;
    updateProfileIcon();
    alert('Företagsinformationen är sparad!');
}

async function deleteAccount() {
    if (prompt("Är du helt säker? Detta raderar all din data. Skriv 'RADERA' för att bekräfta.") === 'RADERA') {
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid));
            await currentUser.delete();
            alert("Ditt konto har tagits bort.");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning av konto:", error);
            alert("Kunde inte ta bort kontot. Du kan behöva logga ut och in igen för att göra detta.");
        }
    }
}

// Kör appen
main();
