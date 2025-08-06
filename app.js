import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, writeBatch, runTransaction, arrayRemove } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

let currentUser;
let userData; // Kommer innehålla { email, companyName, companyId, profileImageURL }

// ----- HUVUDFUNKTIONER -----

function main() {
    onAuthStateChanged(auth, async (user) => {
        if (user && user.emailVerified) {
            currentUser = user;
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists() && userDocSnap.data().companyId) {
                userData = userDocSnap.data();
                initializeAppUI();
            } else {
                console.error("Användardata eller companyId saknas. Loggar ut.");
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
    document.getElementById('user-profile-icon').addEventListener('click', () => document.getElementById('profile-dropdown').classList.toggle('show'));
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

// ----- SID-RENDERING -----

function renderPageContent(page) {
    const mainView = document.getElementById('main-view');
    const pageTitle = document.querySelector('.page-title');
    const newItemBtn = document.getElementById('new-item-btn');
    
    pageTitle.textContent = page;
    mainView.innerHTML = `<div class="card"><p>Laddar...</p></div>`;
    newItemBtn.style.display = 'none';

    switch (page) {
        case 'Översikt': renderDashboard(); break;
        case 'Sammanfattning': renderSummaryPage(); break;
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
        case 'Inställningar': renderSettingsPage(); break;
        default: mainView.innerHTML = `<div class="card"><h3 class="card-title">Sidan hittades inte</h3></div>`;
    }
}

async function renderDashboard() {
    const mainView = document.getElementById('main-view');
    try {
        const incomeQuery = query(collection(db, 'incomes'), where('companyId', '==', userData.companyId));
        const expenseQuery = query(collection(db, 'expenses'), where('companyId', '==', userData.companyId));
        const [incomeSnapshot, expenseSnapshot] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);
        
        const totalIncome = incomeSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const totalExpense = expenseSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const profit = totalIncome - totalExpense;

        mainView.innerHTML = `<div class="dashboard-grid">
                <div class="card text-center"><h3>Totala Intäkter</h3><p class="metric-value green">${totalIncome.toFixed(2)} kr</p></div>
                <div class="card text-center"><h3>Totala Utgifter</h3><p class="metric-value red">${totalExpense.toFixed(2)} kr</p></div>
                <div class="card text-center"><h3>Resultat</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toFixed(2)} kr</p></div>
            </div>`;
    } catch (error) {
        console.error("Fel vid laddning av dashboard:", error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda översikt</h3><p>Ett databasfel uppstod. Kontrollera säkerhetsregler och index.</p></div>`;
    }
}

async function renderSummaryPage() {
    const mainView = document.getElementById('main-view');
    try {
        const incomeQuery = query(collection(db, 'incomes'), where('companyId', '==', userData.companyId));
        const expenseQuery = query(collection(db, 'expenses'), where('companyId', '==', userData.companyId));
        const [incomeSnapshot, expenseSnapshot] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);

        let allTransactions = [];
        incomeSnapshot.forEach(doc => allTransactions.push({ id: doc.id, type: 'income', ...doc.data() }));
        expenseSnapshot.forEach(doc => allTransactions.push({ id: doc.id, type: 'expense', ...doc.data() }));

        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const rows = allTransactions.map(t => {
            const actionCell = t.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${t.id}" data-type="${t.type}">Korrigera</button></td>`;
            return `<tr class="transaction-row ${t.type} ${t.isCorrection ? 'corrected' : ''}">
                <td>${t.date}</td>
                <td>${t.description}</td>
                <td class="text-right ${t.amount >= 0 ? 'green' : 'red'}">${Number(t.amount).toFixed(2)} kr</td>
                ${actionCell}
            </tr>`;
        }).join('');

        mainView.innerHTML = `<div class="card"><h3 class="card-title">Transaktionshistorik</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th class="text-right">Summa</th><th>Åtgärd</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Inga transaktioner att visa.</td></tr>'}</tbody></table></div>`;
        
        mainView.querySelectorAll('.btn-correction').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { id, type } = e.target.dataset;
                renderCorrectionForm(type, id);
            });
        });

    } catch (error) {
        console.error("Fel vid laddning av sammanfattning:", error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda sammanfattning</h3><p>Ett databasfel uppstod.</p></div>`;
    }
}

async function renderTransactionList(type) {
    const mainView = document.getElementById('main-view');
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    const title = type === 'income' ? 'Registrerade Intäkter' : 'Registrerade Utgifter';
    
    try {
        const q = query(collection(db, collectionName), where('companyId', '==', userData.companyId), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);

        const rows = snapshot.docs.map(doc => {
            const data = doc.data();
            const actionCell = data.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${doc.id}" data-type="${type}">Korrigera</button></td>`;
            return `<tr class="${data.isCorrection ? 'corrected' : ''}"><td>${data.date}</td><td>${data.description}</td><td class="text-right">${Number(data.amount).toFixed(2)} kr</td>${actionCell}</tr>`;
        }).join('');

        mainView.innerHTML = `<div class="card"><h3 class="card-title">${title}</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th class="text-right">Summa</th><th>Åtgärd</th></tr></thead><tbody>${rows || `<tr><td colspan="4">Inga transaktioner registrerade.</td></tr>`}</tbody></table></div>`;
        
        mainView.querySelectorAll('.btn-correction').forEach(btn => {
            btn.addEventListener('click', (e) => renderCorrectionForm(e.target.dataset.type, e.target.dataset.id));
        });
    } catch (error) {
        console.error(`Fel vid laddning av ${collectionName}:`, error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda ${title}</h3><p>Ett databasfel uppstod.</p></div>`;
    }
}

function renderTransactionForm(type, originalData = {}, isCorrection = false, originalId = null) {
    const mainView = document.getElementById('main-view');
    const title = isCorrection ? 'Korrigera Transaktion' : `Registrera Ny ${type === 'income' ? 'Intäkt' : 'Utgift'}`;
    const today = new Date().toISOString().slice(0, 10);

    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;">
        <h3 class="card-title">${title}</h3>
        ${isCorrection ? `<p class="correction-notice">Du skapar nu en rättelsepost för en tidigare transaktion. Den gamla posten nollställs och en ny, korrekt post skapas.</p>` : ''}
        <div class="input-group"><label>Datum</label><input id="trans-date" type="date" value="${originalData.date || today}"></div>
        <div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text" value="${originalData.description || ''}"></div>
        <div class="input-group"><label>Kategori</label><input id="trans-cat" type="text" value="${originalData.category || ''}"></div>
        <div class="input-group"><label>Summa (SEK)</label><input id="trans-amount" type="number" placeholder="0.00" value="${originalData.amount || ''}"></div>
        <div style="display: flex; gap: 1rem; margin-top: 1rem;">
            <button id="cancel-btn" class="btn btn-secondary">Avbryt</button>
            <button id="save-btn" class="btn btn-primary">${isCorrection ? 'Spara Rättelse' : 'Spara'}</button>
        </div>
    </div>`;
    
    document.getElementById('save-btn').addEventListener('click', () => {
        const newData = {
            date: document.getElementById('trans-date').value,
            description: document.getElementById('trans-desc').value,
            category: document.getElementById('trans-cat').value,
            amount: parseFloat(document.getElementById('trans-amount').value) || 0,
        };
        if (isCorrection) {
            handleCorrectionSave(type, originalId, originalData, newData);
        } else {
            handleSave(type, newData);
        }
    });
    document.getElementById('cancel-btn').addEventListener('click', () => navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter'));
}

async function renderCorrectionForm(type, docId) {
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        renderTransactionForm(type, docSnap.data(), true, docId);
    } else {
        alert("Kunde inte hitta den ursprungliga transaktionen.");
    }
}


// ----- TRANSAKTIONSHANTERING & BEKRÄFTELSE -----

function handleSave(type, data) {
    const transactionData = { 
        ...data, 
        companyId: userData.companyId, 
        createdBy: currentUser.uid, 
        createdAt: new Date(), 
        isCorrection: false 
    };

    if (!transactionData.date || !transactionData.description || transactionData.amount === 0) {
        alert('Vänligen fyll i datum, beskrivning och en summa.');
        return;
    }
    showConfirmationModal(() => saveTransaction(type, transactionData));
}

async function handleCorrectionSave(type, originalId, originalData, newData) {
     if (!newData.date || !newData.description || newData.amount <= 0) {
        alert('Vänligen fyll i alla fält korrekt för den nya posten.');
        return;
    }
    showConfirmationModal(async () => {
        const batch = writeBatch(db);
        const collectionName = type === 'income' ? 'incomes' : 'expenses';

        // 1. Markera den ursprungliga posten som rättad
        const originalDocRef = doc(db, collectionName, originalId);
        batch.update(originalDocRef, { isCorrection: true });
        
        // 2. Skapa en spegelvänd transaktion för att nollställa den gamla
        const reversalPost = { 
            ...originalData, 
            amount: -originalData.amount, 
            isCorrection: true, 
            correctedPostId: originalId, 
            description: `Rättelse av: ${originalData.description}`, 
            createdAt: new Date(), 
            createdBy: currentUser.uid, 
            companyId: userData.companyId 
        };
        batch.set(doc(collection(db, collectionName)), reversalPost);

        // 3. Skapa den nya, korrekta transaktionen
        const newPost = { 
            ...newData, 
            isCorrection: false, 
            correctsPostId: originalId, 
            createdAt: new Date(), 
            createdBy: currentUser.uid, 
            companyId: userData.companyId 
        };
        batch.set(doc(collection(db, collectionName)), newPost);
        
        await batch.commit();
        navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
    });
}

async function saveTransaction(type, data) {
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    try {
        await addDoc(collection(db, collectionName), data);
        navigateTo(type === 'income' ? 'Intäkter' : 'Utgifter');
    } catch (error) {
        console.error("Fel vid sparning:", error);
        alert("Kunde inte spara transaktionen.");
    }
}

function showConfirmationModal(onConfirm) {
    const container = document.getElementById('confirmation-modal-container');
    container.innerHTML = `<div class="modal-overlay">
        <div class="modal-content">
            <h3>Bekräfta Bokföring</h3>
            <p>Var vänlig bekräfta denna bokföringspost. Enligt Bokföringslagen är detta en slutgiltig aktion. Posten kan inte ändras eller raderas i efterhand, endast korrigeras.</p>
            <div class="modal-actions">
                <button id="modal-cancel" class="btn btn-secondary">Avbryt</button>
                <button id="modal-confirm" class="btn btn-primary">Bekräfta och Bokför</button>
            </div>
        </div>
    </div>`;
    document.getElementById('modal-confirm').onclick = () => { onConfirm(); container.innerHTML = ''; };
    document.getElementById('modal-cancel').onclick = () => { container.innerHTML = ''; };
}

// ----- INSTÄLLNINGAR & ANVÄNDARHANTERING -----

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

async function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    
    const companyDocRef = doc(db, 'companies', userData.companyId);
    const companyDocSnap = await getDoc(companyDocRef);
    const companyData = companyDocSnap.exists() ? companyDocSnap.data() : { members: [] };

    let membersHtml = '<li>Laddar medlemmar...</li>';
    if (companyData.members && companyData.members.length > 0) {
        const memberPromises = companyData.members.map(uid => getDoc(doc(db, 'users', uid)));
        const memberDocs = await Promise.all(memberPromises);
        membersHtml = memberDocs
            .map(memberDoc => memberDoc.exists() ? `<li>${memberDoc.data().email}</li>` : '')
            .join('');
    } else {
        membersHtml = '<li>Inga medlemmar hittades.</li>';
    }

    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3>Profilbild</h3>
                <p>Ladda upp en profilbild eller logotyp (för dig personligen).</p>
                <input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;">
                <button id="save-pic" class="btn btn-primary">Spara Bild</button>
            </div>
            <div class="card">
                <h3>Företagsinformation</h3>
                <div class="input-group">
                    <label>Företagsnamn</label>
                    <input id="setting-company" value="${userData.companyName || ''}">
                </div>
                <button id="save-company" class="btn btn-primary">Spara</button>
            </div>
            <div class="card">
                <h3>Användare i ${userData.companyName}</h3>
                <ul id="user-list">${membersHtml}</ul>
                <div class="input-group" style="margin-top: 1rem;">
                    <label>Bjud in ny användare (e-post)</label>
                    <input type="email" id="invite-email" placeholder="namn@exempel.com">
                </div>
                <button id="invite-btn" class="btn btn-primary">Skicka inbjudan</button>
            </div>
             <div class="card card-danger">
                <h3>Ta bort konto</h3>
                <p>Detta raderar endast DITT användarkonto och tar bort dig från företaget. Det raderar inte företagets data.</p>
                <button id="delete-account" class="btn btn-danger">Ta bort mitt konto</button>
            </div>
        </div>`;
    
    document.getElementById('save-pic').addEventListener('click', saveProfileImage);
    document.getElementById('save-company').addEventListener('click', saveCompanyInfo);
    document.getElementById('invite-btn').addEventListener('click', handleInvite);
    document.getElementById('delete-account').addEventListener('click', deleteAccount);
}

async function saveProfileImage() {
    const fileInput = document.getElementById('profile-pic-upload');
    const file = fileInput.files[0];
    if (!file) return;
    
    const storageRef = ref(storage, `profile_images/${currentUser.uid}/${file.name}`);
    
    try {
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'users', currentUser.uid), { profileImageURL: url });
        userData.profileImageURL = url;
        updateProfileIcon();
        alert('Profilbilden är uppdaterad!');
    } catch (error) {
        console.error("Fel vid uppladdning av bild: ", error);
        alert("Kunde inte spara profilbilden.");
    }
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value.trim();
    if (!newName) {
        alert("Företagsnamnet kan inte vara tomt.");
        return;
    }

    const companyDocRef = doc(db, 'companies', userData.companyId);
    
    try {
        await updateDoc(companyDocRef, { companyName: newName });
        // Uppdatera även användarens lokala kopia av namnet för UI-konsistens
        await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
        
        userData.companyName = newName;
        updateProfileIcon();
        navigateTo('Inställningar'); // Ladda om sidan för att visa nytt namn överallt
        alert('Företagsinformationen är sparad!');
    } catch(error) {
        console.error("Kunde inte spara företagsinformation: ", error);
        alert("Ett fel uppstod när företagsnamnet skulle sparas.");
    }
}

async function handleInvite() {
    const emailInput = document.getElementById('invite-email');
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
        alert("Vänligen ange en e-postadress.");
        return;
    }

    const invitation = {
        email: email,
        companyId: userData.companyId,
        companyName: userData.companyName,
        invitedBy: currentUser.email,
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, 'invitations'), invitation);
        alert(`Inbjudan skickad till ${email}. Användaren kommer att ansluta till ditt företag automatiskt när hen registrerar sig med denna e-post.`);
        emailInput.value = '';
    } catch (error) {
        console.error("Fel vid skapande av inbjudan:", error);
        alert("Kunde inte skicka inbjudan.");
    }
}

async function deleteAccount() {
    if (prompt("Är du helt säker på att du vill radera ditt konto? Detta tar bort din användare permanent men INTE företagets data. Skriv 'RADERA' för att bekräfta.") !== 'RADERA') {
        return;
    }
    
    try {
        // Använd en transaktion för att säkerställa att alla steg lyckas eller misslyckas tillsammans
        await runTransaction(db, async (transaction) => {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const companyDocRef = doc(db, 'companies', userData.companyId);

            // 1. Ta bort användarens ID från företagets medlemslista
            transaction.update(companyDocRef, {
                members: arrayRemove(currentUser.uid)
            });

            // 2. Ta bort användarens dokument från 'users'-samlingen
            transaction.delete(userDocRef);
        });

        // 3. Ta bort användaren från Firebase Authentication
        await auth.currentUser.delete();

        alert("Ditt konto har tagits bort.");
        window.location.href = 'login.html';

    } catch (error) {
        console.error("Fel vid borttagning av konto:", error);
        alert("Kunde inte ta bort kontot. Du kan behöva logga ut och in igen för att kunna utföra denna åtgärd.");
    }
}

// ----- KÖR APPLIKATIONEN -----
main();
