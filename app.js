// app.js

// TODO: Ersätt med din egen Firebase-konfiguration
const firebaseConfig = {
    apiKey: "AIzaSyDGamRgGYt-Bl2Mj0znqAG7uFWM9TC0VgU",
    authDomain: "flowbooks-73cd9.firebaseapp.com",
    projectId: "flowbooks-73cd9",
    storageBucket: "flowbooks-73cd9.appspot.com",
    messagingSenderId: "226642349583",
    appId: "1:226642349583:web:e2376d9283d2d3c33ddd7a",
    measurementId: "G-M0XD9JL3CR"
};

// Initialisera Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

class FlowBooksApp {
    constructor() {
        // Landningssida & Auth-element
        this.landingContainer = document.getElementById('landing-container');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.loginButton = document.getElementById('login-btn');
        this.registerButton = document.getElementById('register-btn');
        this.authError = document.getElementById('auth-error');

        // Verify-element
        this.verifyEmailContainer = document.getElementById('verify-email-container');
        this.verificationEmailAddress = document.getElementById('verification-email-address');
        this.backToLoginButton = document.getElementById('back-to-login-btn');

        // App-element
        this.appContainer = document.getElementById('app-container');
        this.mainView = document.getElementById('main-view');
        this.menuToggleButton = document.getElementById('menu-toggle-btn');
        this.sidebar = document.querySelector('.sidebar');
        this.logoutButton = document.getElementById('logout-btn');
        this.userProfileIcon = document.getElementById('user-profile-icon');
        
        // Navigationselement (NYTT)
        this.sidebarNav = document.querySelector('.sidebar-nav');
        this.pageTitle = document.querySelector('.page-title');

        this.init();
    }

    init() {
        // Sätt upp alla event listeners
        this.loginButton.addEventListener('click', () => this.login());
        this.registerButton.addEventListener('click', () => this.register());
        this.logoutButton.addEventListener('click', () => this.logout());
        this.menuToggleButton.addEventListener('click', () => this.toggleSidebar());
        this.backToLoginButton.addEventListener('click', () => this.showAuth());

        // Navigations-listener (NYTT)
        this.sidebarNav.addEventListener('click', (e) => this.handleNav(e));

        // Lyssna på ändringar i användarens inloggningsstatus
        auth.onAuthStateChanged(user => {
            if (user) {
                if (user.emailVerified) {
                    this.showApp();
                    // Starta på översiktssidan
                    this.navigateTo('Översikt');
                } else {
                    this.showVerification(user.email);
                }
            } else {
                this.showAuth();
            }
        });
    }

    // --- Navigationslogik (NYTT) ---
    handleNav(e) {
        e.preventDefault();
        if (e.target.tagName === 'A') {
            const page = e.target.textContent.split(' ')[0]; // Hämta sidnamn, t.ex. "Intäkter" från "Intäkter (Fakturor)"
            this.navigateTo(page);
        }
    }

    navigateTo(page) {
        // Uppdatera aktiv länk i sidomenyn
        const links = this.sidebarNav.querySelectorAll('a');
        links.forEach(link => {
            link.classList.remove('active');
            if (link.textContent.startsWith(page)) {
                link.classList.add('active');
            }
        });

        // Uppdatera sidans titel
        this.pageTitle.textContent = page;

        // Rendera rätt vy
        switch (page) {
            case 'Översikt':
                this.renderDashboard();
                break;
            case 'Intäkter':
                this.renderInvoices();
                break;
            case 'Utgifter':
                this.renderExpenses();
                break;
            case 'Bank':
                this.renderBank();
                break;
            case 'Rapporter':
                this.renderReports();
                break;
            case 'Inställningar':
                this.renderSettings();
                break;
            default:
                this.renderDashboard();
        }
    }


    // --- Auth-funktioner (oförändrade) ---
    async login() {
        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        this.authError.textContent = '';
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            if (!userCredential.user.emailVerified) {
                await userCredential.user.sendEmailVerification();
                this.showVerification(email);
                await auth.signOut();
            }
        } catch (error) {
            this.authError.textContent = 'Fel e-post eller lösenord.';
            console.error("Login failed:", error);
        }
    }

    async register() {
        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        this.authError.textContent = '';
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.sendEmailVerification();
            this.showVerification(email);
            await auth.signOut();
        } catch (error) {
            if (error.code === 'auth/weak-password') {
                this.authError.textContent = 'Lösenordet måste vara minst 6 tecken.';
            } else if (error.code === 'auth/email-already-in-use') {
                this.authError.textContent = 'E-postadressen är redan registrerad.';
            } else {
                this.authError.textContent = 'Kunde inte registrera användare.';
            }
            console.error("Registration failed:", error);
        }
    }
    
    logout() {
        auth.signOut();
    }

    // --- Funktioner för att visa/dölja vyer (oförändrade) ---
    hideAllViews() {
        this.landingContainer.style.display = 'none';
        this.appContainer.style.display = 'none';
        this.verifyEmailContainer.style.display = 'none';
    }

    showApp() {
        this.hideAllViews();
        this.appContainer.style.display = 'flex';
        // Uppdatera profil-ikon när appen visas
        const user = auth.currentUser;
        if (user) {
            const userInitial = user.email.charAt(0).toUpperCase();
            this.userProfileIcon.innerHTML = `<div class="profile-avatar">${userInitial}</div>`;
        }
    }

    showAuth() {
        this.hideAllViews();
        this.landingContainer.style.display = 'flex';
    }

    showVerification(email) {
        this.hideAllViews();
        this.verificationEmailAddress.textContent = email;
        this.verifyEmailContainer.style.display = 'flex';
    }

    toggleSidebar() {
        this.sidebar.classList.toggle('is-open');
    }

    // --- Rendering-funktioner för varje sida (NYTT & Uppdaterat) ---
    renderDashboard() {
        this.mainView.innerHTML = '';
        const dashboardGrid = document.createElement('div');
        dashboardGrid.className = 'dashboard-grid';
        
        const cashflowCard = this.createCard('Kassaflöde', this.createEmptyState("Ingen data än."));
        const resultatCard = this.createCard('Resultat', this.createEmptyState("Börja bokföra!"));
        const intakterCard = this.createCard('Intäkter', this.createEmptyState("Skapa en faktura."));
        const kostnaderCard = this.createCard('Kostnader', this.createEmptyState("Registrera ett kvitto."));
        const todoCard = this.createCard('Att göra', this.createEmptyState("Du är helt uppdaterad!"));

        dashboardGrid.appendChild(cashflowCard);
        dashboardGrid.appendChild(resultatCard);
        dashboardGrid.appendChild(intakterCard);
        dashboardGrid.appendChild(kostnaderCard);
        dashboardGrid.appendChild(todoCard);

        this.mainView.appendChild(dashboardGrid);
    }
    
    renderInvoices() {
        this.mainView.innerHTML = '';
        const content = this.createEmptyState("Här kommer du kunna se och hantera alla dina kundfakturor.");
        this.mainView.appendChild(content);
    }

    renderExpenses() {
        this.mainView.innerHTML = '';
        const content = this.createEmptyState("Här kommer du kunna se och hantera alla dina utgifter och kvitton.");
        this.mainView.appendChild(content);
    }

    renderBank() {
        this.mainView.innerHTML = '';
        const content = this.createEmptyState("Här kommer du se din bankintegration och transaktioner.");
        this.mainView.appendChild(content);
    }

    renderReports() {
        this.mainView.innerHTML = '';
        const content = this.createEmptyState("Här kommer du kunna skapa momsrapporter och andra finansiella rapporter.");
        this.mainView.appendChild(content);
    }

    renderSettings() {
        this.mainView.innerHTML = '';
        const content = this.createEmptyState("Här kommer du kunna ändra dina företags- och kontoinställningar.");
        this.mainView.appendChild(content);
    }
    
    // --- Återanvändbara UI-komponenter (oförändrade) ---
    createCard(title, contentElement) {
        const card = document.createElement('div');
        card.className = 'card';
        const cardTitle = document.createElement('h3');
        cardTitle.className = 'card-title';
        cardTitle.textContent = title;
        card.appendChild(cardTitle);
        card.appendChild(contentElement);
        return card;
    }

    createEmptyState(text) {
        const p = document.createElement('p');
        p.textContent = text;
        p.style.color = 'var(--text-color-light)';
        p.style.textAlign = 'center';
        p.style.padding = '2rem';
        p.style.fontSize = '1.1rem';
        return p;
    }
}

// Starta applikationen när DOM är laddat
document.addEventListener('DOMContentLoaded', () => {
    new FlowBooksApp();
});
