// app.js - Huvudfil för FlowBooks SPA

// --- Firebase Konfiguration ---
const firebaseConfig = {
    apiKey: "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU",
    authDomain: "flowbooks-73cd9.firebaseapp.com",
    projectId: "flowbooks-73cd9",
    storageBucket: "flowbooks-73cd9.appspot.com",
    messagingSenderId: "226642349583",
    appId: "1:226642349583:web:e2376d9283d2d3c33ddd7a"
};

// --- Initialisering ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const root = document.getElementById('root');

// --- Router och State Hantering ---
const App = {
    user: null,
    userData: null,
    currentRoute: '/',
    
    init() {
        auth.onAuthStateChanged(user => {
            if (user && user.emailVerified) {
                this.user = user;
                this.navigate('/app/Översikt');
            } else {
                this.user = null;
                this.userData = null;
                // Hantera URL:en för att visa rätt sida (login, register, eller landing)
                const path = window.location.pathname;
                if (path.includes('login')) this.navigate('/login');
                else if (path.includes('register')) this.navigate('/register');
                else this.navigate('/');
            }
        });
    },

    async navigate(route) {
        this.currentRoute = route;
        window.history.pushState({}, route, route.replace('/app/', '/')); // Uppdatera URL snyggt
        await this.render();
    },

    async render() {
        const route = this.currentRoute;
        root.innerHTML = ''; // Rensa sidan

        if (route.startsWith('/app') && this.user) {
            // --- Renderar huvud-appen ---
            if (!this.userData) {
                const userDoc = await db.collection('users').doc(this.user.uid).get();
                this.userData = userDoc.data();
            }
            root.innerHTML = this.templates.appShell();
            const page = route.split('/')[2] || 'Översikt';
            this.renderAppPage(page);
            this.setupAppListeners();
        } else if (route === '/login') {
            root.innerHTML = this.templates.loginPage();
            this.setupAuthListeners();
        } else if (route === '/register') {
            root.innerHTML = this.templates.registerPage();
            this.setupAuthListeners();
        } else {
            root.innerHTML = this.templates.landingPage();
            this.setupLandingListeners();
        }
    },
    
    // --- Event Listeners ---
    setupLandingListeners() {
        document.querySelector('#to-login-btn').addEventListener('click', (e) => { e.preventDefault(); this.navigate('/login'); });
        document.querySelector('#to-register-btn').addEventListener('click', (e) => { e.preventDefault(); this.navigate('/register'); });
        document.querySelector('#to-register-btn-large').addEventListener('click', (e) => { e.preventDefault(); this.navigate('/register'); });
    },

    setupAuthListeners() {
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handlers.login());
        }
        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.handlers.register());
        }
    },

    setupAppListeners() {
        document.querySelector('.sidebar-nav').addEventListener('click', e => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                this.navigate(`/app/${e.target.dataset.page}`);
            }
        });
        document.getElementById('user-profile-icon').addEventListener('click', () => {
            document.getElementById('profile-dropdown').classList.toggle('show');
        });
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        document.getElementById('settings-link').addEventListener('click', e => {
            e.preventDefault();
            document.getElementById('profile-dropdown').classList.remove('show');
            this.navigate('/app/Inställningar');
        });
    },

    // --- Sid-renderare för Appen ---
    renderAppPage(page) {
        const mainView = document.getElementById('main-view');
        const pageTitle = document.querySelector('.page-title');
        const newItemBtn = document.getElementById('new-item-btn');

        // Återställ aktiv länk
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        document.querySelector(`.sidebar-nav a[data-page="${page}"]`).classList.add('active');
        
        pageTitle.textContent = page;
        mainView.innerHTML = ''; // Rensa main-vyn

        switch (page) {
            case 'Översikt':
                newItemBtn.style.display = 'none';
                mainView.innerHTML = this.templates.dashboardPage();
                break;
            case 'Utgifter':
                newItemBtn.textContent = 'Ny Utgift';
                newItemBtn.style.display = 'block';
                newItemBtn.onclick = () => this.renderExpenseForm();
                this.renderExpenseList();
                break;
            case 'Inställningar':
                newItemBtn.style.display = 'none';
                mainView.innerHTML = this.templates.settingsPage(this.userData);
                this.setupSettingsListeners();
                break;
            default:
                newItemBtn.style.display = 'none';
                mainView.innerHTML = `<div class="card"><p>Sidan ${page} är under utveckling.</p></div>`;
        }
    },

    async renderExpenseList() {
        const mainView = document.getElementById('main-view');
        const expensesRef = db.collection('expenses').where('userId', '==', this.user.uid);
        const snapshot = await expensesRef.get();
        let tableRows = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            tableRows += `<tr><td>${data.date}</td><td>${data.description}</td><td>${data.amount} kr</td></tr>`;
        });
        mainView.innerHTML = this.templates.expenseListPage(tableRows);
    },

    renderExpenseForm() {
        const mainView = document.getElementById('main-view');
        mainView.innerHTML = this.templates.expenseForm();
        document.getElementById('save-expense-btn').addEventListener('click', () => this.handlers.saveExpense());
    },

    setupSettingsListeners() {
        document.getElementById('save-profile-btn').addEventListener('click', () => this.handlers.saveProfileImage());
        document.getElementById('save-company-btn').addEventListener('click', () => this.handlers.saveCompanyInfo());
        document.getElementById('delete-account-btn').addEventListener('click', () => this.handlers.deleteAccount());
    },

    // --- Handlers (Logik) ---
    handlers: {
        async login() {
            // ... (login-logik)
        },
        async register() {
            // ... (register-logik)
        },
        async saveExpense() {
            // ... (spara-utgift-logik)
        },
        async saveProfileImage() {
            // ... (spara-profilbild-logik)
        },
        async saveCompanyInfo() {
            // ... (spara-företagsinfo-logik)
        },
        async deleteAccount() {
            // ... (ta-bort-konto-logik)
        }
    },

    // --- HTML Mallar ---
    templates: {
        landingPage() { return `...`; },
        loginPage() { return `...`; },
        registerPage() { return `...`; },
        appShell() { return `...`; },
        dashboardPage() { return `...`; },
        expenseListPage(rows) { return `...`; },
        expenseForm() { return `...`; },
        settingsPage(userData) { return `...`; },
    }
};

// --- Fyll i handlers och templates ---
// (Detta gör koden mer läsbar)

App.handlers.login = async function() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        if (!userCredential.user.emailVerified) {
            errorEl.textContent = 'Vänligen verifiera din e-postadress. Kontrollera din inkorg.';
            await auth.signOut();
        }
    } catch (error) {
        errorEl.textContent = 'Fel e-post eller lösenord.';
    }
};

App.handlers.register = async function() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const companyName = document.getElementById('companyName').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';

    if (!companyName) {
        errorEl.textContent = 'Vänligen fyll i företagsnamn.';
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await db.collection('users').doc(user.uid).set({
            email: user.email,
            companyName: companyName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await user.sendEmailVerification();
        alert(`Ett verifieringsmejl har skickats till ${email}. Klicka på länken för att aktivera ditt konto och logga sedan in.`);
        App.navigate('/login');
    } catch (error) {
        if (error.code === 'auth/weak-password') errorEl.textContent = 'Lösenordet måste vara minst 6 tecken.';
        else if (error.code === 'auth/email-already-in-use') errorEl.textContent = 'E-postadressen är redan registrerad.';
        else errorEl.textContent = 'Kunde inte registrera användare.';
    }
};

App.handlers.saveExpense = async function() {
    const newExpense = {
        userId: App.user.uid,
        date: document.getElementById('expense-date').value,
        description: document.getElementById('expense-desc').value,
        amount: parseFloat(document.getElementById('expense-amount').value),
    };
    if (!newExpense.date || !newExpense.description || !newExpense.amount) {
        alert('Vänligen fyll i alla fält.');
        return;
    }
    await db.collection('expenses').add(newExpense);
    App.navigate('/app/Utgifter');
};

App.handlers.saveProfileImage = async function() {
    const file = document.getElementById('profile-pic-upload').files[0];
    if (!file) return;
    const filePath = `profile_images/${App.user.uid}/${file.name}`;
    const fileRef = storage.ref(filePath);
    await fileRef.put(file);
    const url = await fileRef.getDownloadURL();
    await db.collection('users').doc(App.user.uid).update({ profileImageURL: url });
    document.getElementById('user-profile-icon').style.backgroundImage = `url(${url})`;
    alert('Profilbild uppdaterad!');
};

App.handlers.saveCompanyInfo = async function() {
    const newName = document.getElementById('setting-company-name').value;
    await db.collection('users').doc(App.user.uid).update({ companyName: newName });
    alert('Företagsinformation sparad!');
};

App.handlers.deleteAccount = async function() {
    if (confirm('Är du helt säker? Detta raderar ditt konto och all data permanent.')) {
        try {
            // I en riktig app bör detta hanteras av en Cloud Function för att radera all relaterad data.
            await db.collection('users').doc(App.user.uid).delete();
            await App.user.delete();
        } catch (error) {
            console.error("Kunde inte ta bort konto: ", error);
            alert("Kunde inte ta bort kontot. Vänligen logga ut och logga in igen och försök på nytt.");
        }
    }
};

App.templates.landingPage = function() {
    return `
        <header class="landing-header">
            <div class="container">
                <nav class="main-nav">
                    <h2 class="logo">FlowBooks</h2>
                    <div class="nav-links">
                        <a href="#" id="to-login-btn">Logga in</a>
                        <a href="#" id="to-register-btn" class="btn btn-primary">Skapa konto gratis</a>
                    </div>
                </nav>
            </div>
        </header>
        <main>
            <section class="hero-section">
                <div class="container text-center">
                    <h1 class="hero-title">Bokföring för 15 minuter i månaden.</h1>
                    <p class="hero-subtitle">FlowBooks är den AI-drivna co-piloten för dig som modern konsult. Vi automatiserar din administration så att du kan fokusera på det du gör bäst.</p>
                    <a href="#" id="to-register-btn-large" class="btn btn-primary btn-large">Kom igång – Helt gratis</a>
                </div>
            </section>
        </main>
    `;
};

App.templates.loginPage = function() {
    return `
        <div class="auth-page">
            <div class="auth-container">
                <div class="auth-box">
                    <a href="#" onclick="App.navigate('/')" class="logo-link"><h2 class="logo">FlowBooks</h2></a>
                    <h3>Välkommen tillbaka!</h3>
                    <p class="auth-intro">Logga in på ditt konto för att fortsätta.</p>
                    <p id="auth-error" class="error-message"></p>
                    <div class="input-group"><label for="email">E-post</label><input type="email" id="email"></div>
                    <div class="input-group"><label for="password">Lösenord</label><input type="password" id="password"></div>
                    <button id="login-btn" class="btn btn-primary btn-full-width">Logga in</button>
                    <p class="auth-switch">Har du inget konto? <a href="#" onclick="App.navigate('/register')">Skapa ett här</a></p>
                </div>
            </div>
        </div>
    `;
};

App.templates.registerPage = function() {
    return `
        <div class="auth-page">
            <div class="auth-container">
                <div class="auth-box">
                    <a href="#" onclick="App.navigate('/')" class="logo-link"><h2 class="logo">FlowBooks</h2></a>
                    <h3>Skapa ditt konto</h3>
                    <p class="auth-intro">Starta din resa mot en enklare vardag.</p>
                    <p id="auth-error" class="error-message"></p>
                    <div class="input-group"><label for="companyName">Företagsnamn</label><input type="text" id="companyName"></div>
                    <div class="input-group"><label for="email">E-post</label><input type="email" id="email"></div>
                    <div class="input-group"><label for="password">Lösenord</label><input type="password" id="password"></div>
                    <button id="register-btn" class="btn btn-primary btn-full-width">Skapa konto</button>
                    <p class="auth-switch">Har du redan ett konto? <a href="#" onclick="App.navigate('/login')">Logga in här</a></p>
                </div>
            </div>
        </div>
    `;
};

App.templates.appShell = function() {
    const initial = App.userData.companyName ? App.userData.companyName.charAt(0).toUpperCase() : '?';
    const profileStyle = App.userData.profileImageURL ? `style="background-image: url(${App.userData.profileImageURL})"` : '';
    return `
        <div id="app-container">
            <aside class="sidebar">
                <div class="sidebar-header"><h2 class="logo">FlowBooks</h2></div>
                <nav class="sidebar-nav">
                    <ul>
                        <li><a href="#" data-page="Översikt">Översikt</a></li>
                        <li><a href="#" data-page="Utgifter">Utgifter</a></li>
                        <li><a href="#" data-page="Inställningar">Inställningar</a></li>
                    </ul>
                </nav>
            </aside>
            <div class="main-content">
                <header class="main-header">
                    <div class="header-left"><h1 class="page-title"></h1></div>
                    <div class="header-right">
                        <button id="new-item-btn" class="btn btn-primary"></button>
                        <div class="profile-container">
                            <div id="user-profile-icon" class="user-profile" ${profileStyle}>${App.userData.profileImageURL ? '' : initial}</div>
                            <div id="profile-dropdown" class="profile-dropdown">
                                <a href="#" id="settings-link">Inställningar</a>
                                <a href="#" id="logout-btn">Logga ut</a>
                            </div>
                        </div>
                    </div>
                </header>
                <main id="main-view"></main>
            </div>
        </div>
    `;
};

App.templates.dashboardPage = function() {
    return `<div class="dashboard-grid">
        <div class="card"><h3 class="card-title">Kassaflöde</h3><p>Under utveckling.</p></div>
        <div class="card"><h3 class="card-title">Resultat</h3><p>Under utveckling.</p></div>
    </div>`;
};

App.templates.expenseListPage = function(tableRows) {
    return `<div class="card">
        <h3 class="card-title">Registrerade Utgifter</h3>
        <table class="data-table">
            <thead><tr><th>Datum</th><th>Beskrivning</th><th>Belopp</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="3">Inga utgifter registrerade.</td></tr>'}</tbody>
        </table>
    </div>`;
};

App.templates.expenseForm = function() {
    const today = new Date().toISOString().slice(0, 10);
    return `<div class="card">
        <h3 class="card-title">Registrera Ny Utgift</h3>
        <div class="input-group"><label for="expense-date">Datum</label><input type="date" id="expense-date" value="${today}"></div>
        <div class="input-group"><label for="expense-desc">Beskrivning</label><input type="text" id="expense-desc" placeholder="t.ex. Kontorsmaterial"></div>
        <div class="input-group"><label for="expense-amount">Belopp (SEK)</label><input type="number" id="expense-amount" placeholder="299"></div>
        <button id="save-expense-btn" class="btn btn-primary">Spara Utgift</button>
    </div>`;
};

App.templates.settingsPage = function(userData) {
    return `<div class="settings-grid">
        <div class="card">
            <h3 class="card-title">Profil</h3>
            <p>Ladda upp en profilbild/logotyp.</p>
            <input type="file" id="profile-pic-upload" accept="image/*">
            <button id="save-profile-btn" class="btn btn-primary" style="margin-top: 1rem;">Spara bild</button>
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
};


// --- Kör appen ---
App.init();
