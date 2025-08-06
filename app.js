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
        // Auth-element
        this.authContainer = document.getElementById('auth-container');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.loginButton = document.getElementById('login-btn');
        this.registerButton = document.getElementById('register-btn');
        this.authError = document.getElementById('auth-error');

        // App-element
        this.appContainer = document.getElementById('app-container');
        this.mainView = document.getElementById('main-view');
        this.menuToggleButton = document.getElementById('menu-toggle-btn');
        this.sidebar = document.querySelector('.sidebar');
        this.logoutButton = document.getElementById('logout-btn');
        this.userProfileIcon = document.getElementById('user-profile-icon');
        
        this.init();
    }

    init() {
        // Lyssna på Auth-knappar
        this.loginButton.addEventListener('click', () => this.login());
        this.registerButton.addEventListener('click', () => this.register());
        this.logoutButton.addEventListener('click', () => this.logout());
        this.menuToggleButton.addEventListener('click', () => this.toggleSidebar());
        
        // Lyssna på ändringar i användarens inloggningsstatus
        auth.onAuthStateChanged(user => {
            if (user) {
                // Användare är inloggad
                this.showApp();
                this.renderDashboard(user);
            } else {
                // Användare är utloggad
                this.showAuth();
            }
        });
    }

    // --- Auth-funktioner ---
    async login() {
        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        this.authError.textContent = '';
        try {
            await auth.signInWithEmailAndPassword(email, password);
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
            await auth.createUserWithEmailAndPassword(email, password);
        } catch (error) {
            if (error.code === 'auth/weak-password') {
                this.authError.textContent = 'Lösenordet måste vara minst 6 tecken.';
            } else {
                this.authError.textContent = 'Kunde inte registrera användare.';
            }
            console.error("Registration failed:", error);
        }
    }
    
    logout() {
        auth.signOut();
    }

    showApp() {
        this.authContainer.style.display = 'none';
        this.appContainer.style.display = 'flex';
    }

    showAuth() {
        this.authContainer.style.display = 'flex';
        this.appContainer.style.display = 'none';
    }

    toggleSidebar() {
        this.sidebar.classList.toggle('is-open');
    }

    // --- Implementering av Dashboard (utan placeholders) ---

    renderDashboard(user) {
        this.mainView.innerHTML = '';
        const dashboardGrid = document.createElement('div');
        dashboardGrid.className = 'dashboard-grid';

        // Uppdatera profil-ikon
        const userInitial = user.email.charAt(0).toUpperCase();
        this.userProfileIcon.innerHTML = `<div class="profile-avatar">${userInitial}</div>`;
        
        // Här renderar vi korten utan data. Datan skulle normalt hämtas från Firestore.
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
    
    // --- Återanvändbara UI-komponenter ---
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
        p.style.padding = '1rem';
        return p;
    }
}

// Starta applikationen
document.addEventListener('DOMContentLoaded', () => {
    new FlowBooksApp();
});
