// auth.js - Hanterar logik för login.html och register.html

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

// --- Element ---
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');

// --- Logik för Login-sidan ---
const loginButton = document.getElementById('login-btn');
if (loginButton) {
    loginButton.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        authError.textContent = '';
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            if (userCredential.user.emailVerified) {
                window.location.href = 'app.html';
            } else {
                alert('Vänligen verifiera din e-postadress. Kontrollera din inkorg.');
                await auth.signOut();
            }
        } catch (error) {
            authError.textContent = 'Fel e-post eller lösenord.';
            console.error("Login failed:", error);
        }
    });
}

// --- Logik för Registrerings-sidan ---
const registerButton = document.getElementById('register-btn');
const companyNameInput = document.getElementById('companyName');
if (registerButton) {
    registerButton.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        const companyName = companyNameInput.value;
        authError.textContent = '';

        if (!companyName) {
            authError.textContent = 'Vänligen fyll i företagsnamn.';
            return;
        }

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Spara företagsinformation i Firestore
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                companyName: companyName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Skicka verifieringsmejl
            await user.sendEmailVerification();

            alert(`Ett verifieringsmejl har skickats till ${email}. Vänligen klicka på länken för att aktivera ditt konto.`);
            window.location.href = 'login.html';

        } catch (error) {
            if (error.code === 'auth/weak-password') {
                authError.textContent = 'Lösenordet måste vara minst 6 tecken.';
            } else if (error.code === 'auth/email-already-in-use') {
                authError.textContent = 'E-postadressen är redan registrerad.';
            } else {
                authError.textContent = 'Kunde inte registrera användare.';
            }
            console.error("Registration failed:", error);
        }
    });
}
