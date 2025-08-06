// app.js

class FlowBooksApp {
    constructor() {
        this.mainView = document.getElementById('main-view');
        this.menuToggleButton = document.getElementById('menu-toggle-btn');
        this.sidebar = document.querySelector('.sidebar');

        this.init();
    }

    init() {
        // Lyssna på händelser
        this.menuToggleButton.addEventListener('click', () => this.toggleSidebar());
        
        // Rendera startsidan (Dashboard)
        this.renderDashboard();
    }
    
    toggleSidebar() {
        this.sidebar.classList.toggle('is-open');
    }

    // --- Återanvändbara UI-komponenter ---

    createButton(text, type = 'primary') {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = `btn btn-${type}`;
        return button;
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
    
    createInput(label, type = 'text', placeholder = '') {
        // Implementering för input-komponent (ej använd i dashboard)
        const wrapper = document.createElement('div');
        const labelEl = document.createElement('label');
        const inputEl = document.createElement('input');
        
        labelEl.textContent = label;
        inputEl.type = type;
        inputEl.placeholder = placeholder;
        
        wrapper.appendChild(labelEl);
        wrapper.appendChild(inputEl);
        return wrapper;
    }

    createModal(title, contentElement) {
        // Implementering för modal (ej använd i dashboard)
        const modal = document.createElement('div');
        // ... Logik för att skapa modal ...
        return modal;
    }

    // --- Implementering av Dashboard ---

    renderDashboard() {
        // Rensa befintlig vy
        this.mainView.innerHTML = '';
        
        const dashboardGrid = document.createElement('div');
        dashboardGrid.className = 'dashboard-grid';

        // 1. Kassaflödeskort
        const cashflowContent = document.createElement('canvas');
        cashflowContent.id = 'cashFlowChart';
        const cashflowCard = this.createCard('Kassaflöde (senaste 30 dagarna)', cashflowContent);

        // 2. Nyckeltalskort (grupperade)
        const metricsContainer = document.createElement('div');
        metricsContainer.className = 'dashboard-grid'; // Använd samma grid för interna kort
        metricsContainer.style.gridColumn = 'span 2'; // Få den att ta upp mer plats om möjligt

        const createMetricCard = (title, value) => {
            const content = document.createElement('div');
            const p = document.createElement('p');
            p.className = 'metric-value';
            p.textContent = value;
            content.appendChild(p);
            return this.createCard(title, content);
        };
        
        const resultatCard = createMetricCard('Resultat', '+15 230 kr');
        const intakterCard = createMetricCard('Intäkter', '45 000 kr');
        const kostnaderCard = createMetricCard('Kostnader', '-29 770 kr');

        // 3. Att-göra-kort
        const todoContent = document.createElement('ul');
        todoContent.className = 'todo-list';
        const todoItems = [
            { text: '3 transaktioner att granska', href: '#' },
            { text: 'Momsrapport för Q3 ska godkännas (förfaller om 5 dagar)', href: '#' },
            { text: 'Faktura #1023 är förfallen', href: '#' },
        ];
        todoItems.forEach(item => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.textContent = item.text;
            a.href = item.href;
            li.appendChild(a);
            todoContent.appendChild(li);
        });
        const todoCard = this.createCard('Att göra', todoContent);


        // Lägg till korten i gridden
        dashboardGrid.appendChild(cashflowCard);
        dashboardGrid.appendChild(resultatCard);
        dashboardGrid.appendChild(intakterCard);
        dashboardGrid.appendChild(kostnaderCard);
        dashboardGrid.appendChild(todoCard);

        this.mainView.appendChild(dashboardGrid);

        // Här skulle man initiera diagrammet, t.ex. med Chart.js
        // const ctx = document.getElementById('cashFlowChart').getContext('2d');
        // new Chart(ctx, { ... config ... });
    }
}

// Starta applikationen när DOM är laddat
document.addEventListener('DOMContentLoaded', () => {
    new FlowBooksApp();
});
