// app.js - Hanterar all logik för app.html

const firebaseConfig = {
    apiKey: "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU",
    authDomain: "flowbooks-73cd9.firebaseapp.com",
    projectId: "flowbooks-73cd9",
    storageBucket: "flowbooks-73cd9.appspot.com",
    messagingSenderId: "226642349583",
    appId: "1:226642349583:web:e2376d9283d2d3c33ddd7a"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

class FlowBooksApp {
    constructor() {
        this.mainView = document.getElementById('main-view');
        this.pageTitle = document.querySelector('.page-title');
        this.newItemBtn = document.getElementById('new-item-btn');
        this.userProfileIcon = document.getElementById('user-profile-icon');
        this.profileDropdown = document.getElementById('profile-dropdown');
        this.init();
    }

    init() {
        auth.onAuthStateChanged(user => {
            if (user && user.emailVerified) {
                this.currentUser = user;
                this.loadUserProfile();
                this.setupEventListeners();
                this.navigateTo('Översikt');
            } else {
                window.location.href = 'login.html';
            }
        });
    }

    setupEventListeners() {
        document.querySelector('.sidebar-nav').addEventListener('click', e => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                this.navigateTo(e.target.dataset.page);
            }
        });
        this.userProfileIcon.addEventListener('click', () => {
            this.profileDropdown.classList.toggle('show');
        });
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        document.getElementById('settings-link').addEventListener('click', e => {
            e.preventDefault();
            this.profileDropdown.classList.remove('show');
            this.navigateTo('Inställningar');
        });
    }
    
    async loadUserProfile() {
        const userDoc = await db.collection('users').doc(this.currentUser.uid).get();
        const userData = userDoc.data();
        if (userData && userData.profileImageURL) {
            this.userProfileIcon.style.backgroundImage = `url(${userData.profileImageURL})`;
        } else {
            const initial = userData.companyName.charAt(0).toUpperCase();
            this.userProfileIcon.textContent = initial;
        }
    }

    navigateTo(page) {
        // ... (Navigationslogik från tidigare)
    }

    // --- Renderingsfunktioner ---
    renderDashboard() {
        this.pageTitle.textContent = 'Översikt';
        this.newItemBtn.style.display = 'none';
        this.mainView.innerHTML = `<div class="dashboard-grid">
            <div class="card"><h3 class="card-title">Kassaflöde</h3><p>Ingen data än.</p></div>
            <div class="card"><h3 class="card-title">Resultat</h3><p>Ingen data än.</p></div>
        </div>`;
    }
    
    async renderInvoices() {
        // ... (Logik för att rendera fakturor)
    }

    async renderExpenses() {
        this.pageTitle.textContent = 'Utgifter';
        this.newItemBtn.textContent = 'Ny Utgift';
        this.newItemBtn.style.display = 'block';
        
        this.newItemBtn.onclick = () => this.renderExpenseForm();

        const expensesRef = db.collection('expenses').where('userId', '==', this.currentUser.uid);
        const snapshot = await expensesRef.get();
        let tableRows = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            tableRows += `<tr><td>${data.date}</td><td>${data.description}</td><td>${data.amount} kr</td></tr>`;
        });

        this.mainView.innerHTML = `<div class="card">
            <h3 class="card-title">Registrerade Utgifter</h3>
            <table class="data-table">
                <thead><tr><th>Datum</th><th>Beskrivning</th><th>Belopp</th></tr></thead>
                <tbody>${tableRows || '<tr><td colspan="3">Inga utgifter registrerade.</td></tr>'}</tbody>
            </table>
        </div>`;
    }

    renderExpenseForm(expense = {}) {
        this.pageTitle.textContent = 'Ny Utgift';
        this.mainView.innerHTML = `<div class="card">
            <div class="input-group">
                <label for="expense-date">Datum</label>
                <input type="date" id="expense-date" value="${expense.date || new Date().toISOString().slice(0, 10)}">
            </div>
            <div class="input-group">
                <label for="expense-desc">Beskrivning</label>
                <input type="text" id="expense-desc" placeholder="t.ex. Kontorsmaterial" value="${expense.description || ''}">
            </div>
            <div class="input-group">
                <label for="expense-amount">Belopp (SEK)</label>
                <input type="number" id="expense-amount" placeholder="299" value="${expense.amount || ''}">
            </div>
            <button id="save-expense-btn" class="btn btn-primary">Spara Utgift</button>
        </div>`;

        document.getElementById('save-expense-btn').addEventListener('click', async () => {
            const newExpense = {
                userId: this.currentUser.uid,
                date: document.getElementById('expense-date').value,
                description: document.getElementById('expense-desc').value,
                amount: parseFloat(document.getElementById('expense-amount').value),
            };
            await db.collection('expenses').add(newExpense);
            this.navigateTo('Utgifter');
        });
    }

    async renderSettings() {
        this.pageTitle.textContent = 'Inställningar';
        this.newItemBtn.style.display = 'none';
        
        const userDoc = await db.collection('users').doc(this.currentUser.uid).get();
        const userData = userDoc.data();

        this.mainView.innerHTML = `<div class="settings-grid">
            <div class="card">
                <h3 class="card-title">Profil</h3>
                <p>Ladda upp en profilbild/logotyp.</p>
                <input type="file" id="profile-pic-upload" accept="image/*">
                <button id="save-profile-btn" class="btn btn-primary">Spara bild</button>
            </div>
            <div class="card">
                <h3 class="card-title">Företagsinformation</h3>
                <div class="input-group">
                    <label for="setting-company-name">Företagsnamn</label>
                    <input type="text" id="setting-company-name" value="${userData.companyName || ''}">
                </div>
                 <button id="save-company-btn" class="btn btn-primary">Spara ändringar</button>
            </div>
            <div class="card">
                <h3 class="card-title">Ta bort konto</h3>
                <p>Detta raderar all din data permanent och kan inte ångras.</p>
                <button id="delete-account-btn" class="btn btn-danger">Ta bort mitt konto</button>
            </div>
        </div>`;
        
        // --- Event Listeners för Inställningar ---
        document.getElementById('save-profile-btn').addEventListener('click', async () => {
            const file = document.getElementById('profile-pic-upload').files[0];
            if (!file) return;
            const filePath = `profile_images/${this.currentUser.uid}/${file.name}`;
            const fileRef = storage.ref(filePath);
            await fileRef.put(file);
            const url = await fileRef.getDownloadURL();
            await db.collection('users').doc(this.currentUser.uid).update({ profileImageURL: url });
            this.loadUserProfile();
            alert('Profilbild uppdaterad!');
        });

        document.getElementById('save-company-btn').addEventListener('click', async () => {
            const newName = document.getElementById('setting-company-name').value;
            await db.collection('users').doc(this.currentUser.uid).update({ companyName: newName });
            alert('Företagsinformation sparad!');
        });
        
        document.getElementById('delete-account-btn').addEventListener('click', async () => {
            if (confirm('Är du helt säker? Detta raderar ditt konto och all data permanent.')) {
                // Ta bort användardata från Firestore först (viktigt!)
                // I en riktig app skulle man använda en Cloud Function för detta.
                await db.collection('users').doc(this.currentUser.uid).delete();
                await this.currentUser.delete(); // Raderar användaren från Auth
                window.location.href = 'login.html';
            }
        });
    }
}

new FlowBooksApp();
