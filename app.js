import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

let currentUser;
let userData;

// ----- HUVUDFUNKTIONER -----
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
                console.error("Användardata saknas i Firestore. Loggar ut.");
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
    document.getElementById('user-profile-icon').addEventListener('click', () => {
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
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const link = document.querySelector(`.sidebar-nav a[data-page="${page}"]`);
    if (link) {
        link.classList.add('active');
    }
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
        case 'Rapporter': renderReportsPage(); break;
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
        const incomeQuery = query(collection(db, 'incomes'), where('userId', '==', currentUser.uid));
        const expenseQuery = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid));
        const [incomeSnapshot, expenseSnapshot] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);
        
        const totalIncome = incomeSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const totalExpense = expenseSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const profit = totalIncome - totalExpense;

        mainView.innerHTML = `
            <div class="dashboard-grid">
                <div class="card text-center"><h3>Totala Intäkter</h3><p class="metric-value green">${totalIncome.toFixed(2)} kr</p></div>
                <div class="card text-center"><h3>Totala Utgifter</h3><p class="metric-value red">${totalExpense.toFixed(2)} kr</p></div>
                <div class="card text-center"><h3>Resultat</h3><p class="metric-value ${profit >= 0 ? 'blue' : 'red'}">${profit.toFixed(2)} kr</p></div>
            </div>`;
    } catch (error) {
        console.error("Fel vid laddning av dashboard:", error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda översikt</h3><p>Kontrollera att databasindex är korrekt skapade.</p></div>`;
    }
}

async function renderSummaryPage() {
    const mainView = document.getElementById('main-view');
    try {
        const incomeQuery = query(collection(db, 'incomes'), where('userId', '==', currentUser.uid));
        const expenseQuery = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid));
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
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda sammanfattning</h3><p>Kontrollera att databasindex är korrekt skapade.</p></div>`;
    }
}

async function renderTransactionList(type) {
    const mainView = document.getElementById('main-view');
    const collectionName = type === 'income' ? 'incomes' : 'expenses';
    const title = type === 'income' ? 'Registrerade Intäkter' : 'Registrerade Utgifter';
    
    try {
        const q = query(collection(db, collectionName), where('userId', '==', currentUser.uid), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);

        const rows = snapshot.docs.map(doc => {
            const data = doc.data();
            const actionCell = data.isCorrection ? '<td>Rättad</td>' : `<td><button class="btn-correction" data-id="${doc.id}" data-type="${type}">Korrigera</button></td>`;
            const attachmentCell = data.attachmentUrl ? `<td><a href="${data.attachmentUrl}" target="_blank" class="receipt-link">Visa</a></td>` : '<td>-</td>';
            return `<tr class="${data.isCorrection ? 'corrected' : ''}"><td>${data.date}</td><td>${data.description}</td><td class="text-right">${Number(data.amount).toFixed(2)} kr</td>${attachmentCell}<td>${actionCell}</td></tr>`;
        }).join('');

        mainView.innerHTML = `<div class="card"><h3 class="card-title">${title}</h3><table class="data-table"><thead><tr><th>Datum</th><th>Beskrivning</th><th class="text-right">Summa</th><th>Underlag</th><th>Åtgärd</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        
        mainView.querySelectorAll('.btn-correction').forEach(btn => {
            btn.addEventListener('click', (e) => renderCorrectionForm(e.target.dataset.type, e.target.dataset.id));
        });
    } catch (error) {
        console.error(`Fel vid laddning av ${collectionName}:`, error);
        mainView.innerHTML = `<div class="card card-danger"><h3>Kunde inte ladda ${title}</h3><p>Kontrollera databasindex för '${collectionName}'.</p></div>`;
    }
}

function renderTransactionForm(type, originalData = {}, isCorrection = false, originalId = null) {
    const mainView = document.getElementById('main-view');
    const title = isCorrection ? 'Korrigera Transaktion' : `Registrera Ny ${type === 'income' ? 'Intäkt' : 'Utgift'}`;
    const today = new Date().toISOString().slice(0, 10);
    const fileUploadField = `<div class="input-group"><label>Underlag (valfritt)</label><input id="trans-attachment" type="file" accept="image/*,.pdf"></div>`;

    mainView.innerHTML = `<div class="card" style="max-width: 600px; margin: auto;"><h3 class="card-title">${title}</h3>
        ${isCorrection ? `<p class="correction-notice">Du skapar nu en rättelsepost. Den gamla posten nollställs och en ny, korrekt post skapas.</p>` : ''}
        <div class="input-group"><label>Datum</label><input id="trans-date" type="date" value="${originalData.date || today}"></div>
        <div class="input-group"><label>Beskrivning</label><input id="trans-desc" type="text" value="${originalData.description || ''}"></div>
        <div class="input-group"><label>Summa (SEK)</label><input id="trans-amount" type="number" placeholder="0.00" value="${originalData.amount || ''}"></div>
        ${fileUploadField}
        <div style="display: flex; gap: 1rem; margin-top: 1rem;"><button id="cancel-btn" class="btn btn-secondary">Avbryt</button><button id="save-btn" class="btn btn-primary">${isCorrection ? 'Spara Rättelse' : 'Spara'}</button></div></div>`;
    
    document.getElementById('save-btn').addEventListener('click', () => {
        const newData = {
            date: document.getElementById('trans-date').value,
            description: document.getElementById('trans-desc').value,
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

// ----- RAPPORTER -----
function renderReportsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `
        <div class="settings-grid">
            <div class="card">
                <h3 class="card-title">Momsrapport (Förenklad)</h3>
                <p>Välj en period för att beräkna moms. Detta är en förenklad rapport som antar 25% moms på allt.</p>
                <div class="input-group"><label>Startdatum</label><input type="date" id="vat-start"></div>
                <div class="input-group"><label>Slutdatum</label><input type="date" id="vat-end"></div>
                <button id="generate-vat-btn" class="btn btn-primary">Generera Momsrapport</button>
                <div id="vat-result" class="report-result"></div>
            </div>
            <div class="card">
                <h3 class="card-title">Dataexport (SIE4)</h3>
                <p>Exportera all din bokföringsdata för innevarande år till en SIE4-fil. Denna fil kan du ge till din redovisningskonsult eller importera i ett annat program.</p>
                <button id="export-sie-btn" class="btn btn-primary">Exportera SIE4-fil</button>
            </div>
        </div>
    `;
    document.getElementById('generate-vat-btn').addEventListener('click', generateVatReport);
    document.getElementById('export-sie-btn').addEventListener('click', exportSieFile);
}

async function generateVatReport() {
    const startDate = document.getElementById('vat-start').value;
    const endDate = document.getElementById('vat-end').value;
    const resultDiv = document.getElementById('vat-result');
    if (!startDate || !endDate) {
        alert("Välj start- och slutdatum.");
        return;
    }
    resultDiv.innerHTML = `<p>Beräknar...</p>`;

    const incomeQuery = query(collection(db, 'incomes'), where('userId', '==', currentUser.uid), where('date', '>=', startDate), where('date', '<=', endDate));
    const expenseQuery = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid), where('date', '>=', startDate), where('date', '<=', endDate));
    const [incomeSnap, expenseSnap] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);

    const totalSales = incomeSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
    const outgoingVat = totalSales * 0.20; // 25% moms -> 20% av totalbeloppet
    const totalPurchases = expenseSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
    const incomingVat = totalPurchases * 0.20;
    const vatToPay = outgoingVat - incomingVat;

    resultDiv.innerHTML = `
        <h4>Resultat för ${startDate} till ${endDate}</h4>
        <p><strong>Försäljning exkl. moms:</strong> ${ (totalSales - outgoingVat).toFixed(2) } kr</p>
        <p><strong>Utgående moms (25%):</strong> ${ outgoingVat.toFixed(2) } kr</p>
        <hr>
        <p><strong>Inköp exkl. moms:</strong> ${ (totalPurchases - incomingVat).toFixed(2) } kr</p>
        <p><strong>Ingående moms (avdragsgill):</strong> ${ incomingVat.toFixed(2) } kr</p>
        <hr>
        <p><strong>Moms att ${vatToPay >= 0 ? 'betala' : 'få tillbaka'}:</strong> <strong class="${vatToPay >= 0 ? 'red' : 'green'}">${Math.abs(vatToPay).toFixed(2)} kr</strong></p>
    `;
}

async function exportSieFile() {
    alert("Skapar SIE4-fil... Detta kan ta en stund.");
    const year = new Date().getFullYear();
    const incomeQuery = query(collection(db, 'incomes'), where('userId', '==', currentUser.uid));
    const expenseQuery = query(collection(db, 'expenses'), where('userId', '==', currentUser.uid));
    const [incomeSnap, expenseSnap] = await Promise.all([getDocs(incomeQuery), getDocs(expenseQuery)]);

    let transactions = [];
    incomeSnap.forEach(doc => transactions.push({ type: 'income', ...doc.data() }));
    expenseSnap.forEach(doc => transactions.push({ type: 'expense', ...doc.data() }));
    transactions = transactions.filter(t => new Date(t.date).getFullYear() === year);
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    let sieContent = `#FLAGGA 0\r\n`;
    sieContent += `#PROGRAM "FlowBooks 1.0"\r\n`;
    sieContent += `#FORMAT PC8\r\n`;
    sieContent += `#GEN ${new Date().toISOString().slice(0,10).replace(/-/g, '')}\r\n`;
    sieContent += `#SIETYP 4\r\n`;
    sieContent += `#FNAMN "${userData.companyName}"\r\n`;
    sieContent += `#RAR 0 ${year}-01-01 ${year}-12-31\r\n`;
    sieContent += `#KONTO 1930 "Företagskonto"\r\n`;
    sieContent += `#KONTO 3010 "Försäljning"\r\n`;
    sieContent += `#KONTO 6100 "Kontorsmaterial & Förbrukningsvaror"\r\n`;

    transactions.forEach((t, index) => {
        const date = t.date.replace(/-/g, '');
        const verNum = index + 1;
        sieContent += `#VER A ${verNum} ${date} "${t.description}"\r\n{\r\n`;
        if (t.type === 'income') {
            sieContent += `  #TRANS 1930 {} ${t.amount.toFixed(2)}\r\n`;
            sieContent += `  #TRANS 3010 {} ${-t.amount.toFixed(2)}\r\n`;
        } else {
            sieContent += `  #TRANS 6100 {} ${t.amount.toFixed(2)}\r\n`;
            sieContent += `  #TRANS 1930 {} ${-t.amount.toFixed(2)}\r\n`;
        }
        sieContent += `}\r\n`;
    });

    const blob = new Blob([sieContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `flowbooks_export_${year}.se`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ----- TRANSAKTIONSHANTERING -----
function handleSave(type, data) {
    const attachmentFile = document.getElementById('trans-attachment').files[0];
    const transactionData = { ...data, userId: currentUser.uid, createdAt: new Date(), isCorrection: false, attachmentUrl: null };
    
    if (!transactionData.date || !transactionData.description || transactionData.amount === 0) {
        alert('Vänligen fyll i datum, beskrivning och en summa.');
        return;
    }

    showConfirmationModal(async () => {
        const saveButton = document.getElementById('modal-confirm');
        saveButton.disabled = true;
        saveButton.textContent = 'Sparar...';

        if (attachmentFile) {
            const folder = type === 'income' ? 'income_attachments' : 'expense_attachments';
            const storageRef = ref(storage, `${folder}/${currentUser.uid}/${Date.now()}-${attachmentFile.name}`);
            try {
                await uploadBytes(storageRef, attachmentFile);
                transactionData.attachmentUrl = await getDownloadURL(storageRef);
            } catch (error) {
                console.error("Fel vid uppladdning:", error);
                alert("Kunde inte ladda upp fil. Transaktionen avbröts.");
                return;
            }
        }
        await saveTransaction(type, transactionData);
    });
}

async function handleCorrectionSave(type, originalId, originalData, newData) {
    if (!newData.date || !newData.description || newData.amount === 0) {
        alert('Vänligen fyll i alla fält korrekt för den nya posten.');
        return;
    }
    showConfirmationModal(async () => {
        const batch = writeBatch(db);
        const collectionName = type === 'income' ? 'incomes' : 'expenses';

        const originalDocRef = doc(db, collectionName, originalId);
        batch.update(originalDocRef, { isCorrection: true });
        
        const reversalPost = { ...originalData, amount: -originalData.amount, isCorrection: true, correctedPostId: originalId, description: `Rättelse av: ${originalData.description}`, createdAt: new Date() };
        const reversalDocRef = doc(collection(db, collectionName));
        batch.set(reversalDocRef, reversalPost);

        const newPost = { ...newData, userId: currentUser.uid, createdAt: new Date(), isCorrection: false, correctsPostId: originalId };
        const newDocRef = doc(collection(db, collectionName));
        batch.set(newDocRef, newPost);
        
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
    container.innerHTML = `<div class="modal-overlay"><div class="modal-content"><h3>Bekräfta Bokföring</h3><p>Var vänlig bekräfta denna bokföringspost. Enligt Bokföringslagen är detta en slutgiltig aktion. Posten kan inte ändras eller raderas i efterhand.</p><div class="modal-actions"><button id="modal-cancel" class="btn btn-secondary">Avbryt</button><button id="modal-confirm" class="btn btn-primary">Bekräfta och Bokför</button></div></div></div>`;
    document.getElementById('modal-confirm').onclick = () => onConfirm();
    document.getElementById('modal-cancel').onclick = () => { container.innerHTML = ''; };
}

// ----- INSTÄLLNINGAR -----
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

function renderSettingsPage() {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = `<div class="settings-grid"><div class="card"><h3>Profilbild</h3><p>Ladda upp en profilbild eller logotyp.</p><input type="file" id="profile-pic-upload" accept="image/*" style="margin-top: 1rem; margin-bottom: 1rem;"><button id="save-pic" class="btn btn-primary">Spara Bild</button></div><div class="card"><h3>Företagsinformation</h3><div class="input-group"><label>Företagsnamn</label><input id="setting-company" value="${userData.companyName || ''}"></div><button id="save-company" class="btn btn-primary">Spara</button></div><div class="card card-danger"><h3>Ta bort konto</h3><p>All din data raderas permanent. Detta kan inte ångras.</p><button id="delete-account" class="btn btn-danger">Ta bort kontot permanent</button></div></div>`;
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
    await updateDoc(doc(db, 'users', currentUser.uid), { profileImageURL: url });
    userData.profileImageURL = url;
    updateProfileIcon();
    alert('Profilbilden är uppdaterad!');
}

async function saveCompanyInfo() {
    const newName = document.getElementById('setting-company').value;
    if (!newName) return;
    await updateDoc(doc(db, 'users', currentUser.uid), { companyName: newName });
    userData.companyName = newName;
    updateProfileIcon();
    alert('Företagsinformationen är sparad!');
}

async function deleteAccount() {
    if (prompt("Är du helt säker? Skriv 'RADERA' för att bekräfta.") === 'RADERA') {
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid));
            await auth.currentUser.delete();
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Fel vid borttagning av konto:", error);
            alert("Kunde inte ta bort kontot. Du kan behöva logga ut och in igen för att göra detta.");
        }
    }
}

// Kör appen
main();
