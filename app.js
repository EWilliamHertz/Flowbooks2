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
        
        this.init();
    }

    init() {
        // Sätt upp alla event listeners
        this.loginButton.addEventListener('click', () => this.login());
        this.registerButton.addEventListener('click', () => this.register());
        this.logoutButton.addEventListener('click', () => this.logout());
        this.menuToggleButton.addEventListener('click', () => this.toggleSidebar());
        this.backToLoginButton.addEventListener('click', () => this.showAuth());

        // Lyssna på ändringar i användarens inloggningsstatus
        auth.onAuthStateChanged(user => {
            if (user) {
                // Användare är inloggad, kolla om e-post är verifierad
                if (user.emailVerified) {
                    this.showApp();
                    this.renderDashboard(user);
                } else {
                    // Användaren är inte verifierad
                    this.showVerification(user.email);
                }
            } else {
                // Användare är utloggad
                this.showAuth();
            }
        });
    }

    async login() {
        const email = this.emailInput.value;
        const password = this.passwordInput.value;
        this.authError.textContent = '';
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            if (!userCredential.user.emailVerified) {
                // Skicka mejl igen om användaren inte är verifierad och försöker logga in
                await userCredential.user.sendEmailVerification();
                this.showVerification(email);
                await auth.signOut(); // Logga ut igen för att tvinga verifiering
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
            // Skicka verifieringsmejl
            await userCredential.user.sendEmailVerification();
            // Visa verifierings-skärmen
            this.showVerification(email);
            // Logga ut för att tvinga användaren att verifiera sig innan inloggning
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

    // --- Funktioner för att visa/dölja vyer ---
    hideAllViews() {
        this.landingContainer.style.display = 'none';
        this.appContainer.style.display = 'none';
        this.verifyEmailContainer.style.display = 'none';
    }

    showApp() {
        this.hideAllViews();
        this.appContainer.style.display = 'flex';
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

    renderDashboard(user) {
        this.mainView.innerHTML = '';
        const dashboardGrid = document.createElement('div');
        dashboardGrid.className = 'dashboard-grid';
        const userInitial = user.email.charAt(0).toUpperCase();
        this.userProfileIcon.innerHTML = `<div class="profile-avatar">${userInitial}</div>`;
        
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

// Starta applikationen när DOM är laddat
document.addEventListener('DOMContentLoaded', () => {
    new FlowBooksApp();
});
