import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot, where, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD1k51cZUKoRaj2TL0uE54AKFlLh29XB14",
  authDomain: "vitrinasiot.firebaseapp.com",
  projectId: "vitrinasiot",
  storageBucket: "vitrinasiot.firebasestorage.app",
  messagingSenderId: "561450941909",
  appId: "1:561450941909:web:029947d932a8211a89915c",
  measurementId: "G-X35634Y50Y"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// State Management
let unsubscribe = null;
let currentView = 'all';
let currentTelemetryDocs = [];

const speciesMap = {
    '1': 'Brachiaria brizantha', '2': 'Brachiaria brizantha', '3': 'Brachiaria brizantha',
    '4': 'Zea mays', '5': 'Zea mays', '6': 'Zea mays',
    'all': 'Múltiples Especies'
};

// Mobile Drawer Elements
const mobileDrawer = document.getElementById('mobile-drawer');
const mobileDrawerContent = document.getElementById('mobile-drawer-content');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenuCloseBtn = document.getElementById('mobile-menu-close');
const mobileDrawerBackdrop = document.getElementById('mobile-drawer-backdrop');

function toggleDrawer(open) {
    if (!mobileDrawer || !mobileDrawerContent) return;
    if (open) {
        mobileDrawer.classList.remove('hidden');
        setTimeout(() => {
            mobileDrawerContent.classList.remove('-translate-x-full');
        }, 10);
    } else {
        mobileDrawerContent.classList.add('-translate-x-full');
        setTimeout(() => {
            mobileDrawer.classList.add('hidden');
        }, 300);
    }
}

if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleDrawer(true));
if (mobileMenuCloseBtn) mobileMenuCloseBtn.addEventListener('click', () => toggleDrawer(false));
if (mobileDrawerBackdrop) mobileDrawerBackdrop.addEventListener('click', () => toggleDrawer(false));

// Chart Setup
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.color = '#64748b';

const createChartOptions = (showLegend = false) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { display: showLegend, position: 'top', labels: { usePointStyle: true, boxWidth: 6 } },
        tooltip: { backgroundColor: '#1e293b', padding: 12 }
    },
    scales: { y: { grid: { color: '#f1f5f9' }, border: { display: false } }, x: { grid: { display: false }, border: { display: false } } }
});

const chartSuelo = new Chart(document.getElementById('chartSuelo').getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [
        { label: 'Suelo 1', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 },
        { label: 'Suelo 2', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', fill: true, tension: 0.4 }
    ]},
    options: createChartOptions(true)
});

const chartAire = new Chart(document.getElementById('chartAire').getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Humedad', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 }] },
    options: createChartOptions()
});

const chartTemp = new Chart(document.getElementById('chartTemp').getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Temp', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4 }] },
    options: createChartOptions()
});

// Evaluate Thresholds for Cultivation Alert Badges & Styles
function evaluateThresholds(suelo1, suelo2, aireHum, temp) {
    const thresholds = {
        suelo: 300,  // Humedad del suelo < 300 es Seco (Peligro)
        temp: 35     // Temperatura ambiente > 35°C es Calor Extremo (Peligro)
    };

    // Suelo 1 Card
    const cardSuelo1 = document.getElementById('card-suelo1');
    const badgeSuelo1 = document.getElementById('badge-suelo1');
    if (suelo1 < thresholds.suelo) {
        cardSuelo1.classList.add('card-danger-glow');
        badgeSuelo1.innerText = 'Peligro: Seco';
        badgeSuelo1.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 animate-pulse';
    } else {
        cardSuelo1.classList.remove('card-danger-glow');
        badgeSuelo1.innerText = 'Óptimo';
        badgeSuelo1.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600';
    }

    // Suelo 2 Card
    const cardSuelo2 = document.getElementById('card-suelo2');
    const badgeSuelo2 = document.getElementById('badge-suelo2');
    if (suelo2 < thresholds.suelo) {
        cardSuelo2.classList.add('card-danger-glow');
        badgeSuelo2.innerText = 'Peligro: Seco';
        badgeSuelo2.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 animate-pulse';
    } else {
        cardSuelo2.classList.remove('card-danger-glow');
        badgeSuelo2.innerText = 'Óptimo';
        badgeSuelo2.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600';
    }

    // Humedad Aire Card
    const badgeAire = document.getElementById('badge-aire');
    if (aireHum < 40) {
        badgeAire.innerText = 'Humedad Baja';
        badgeAire.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600';
    } else {
        badgeAire.innerText = 'Óptimo';
        badgeAire.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600';
    }

    // Temperatura Card
    const cardTemp = document.getElementById('card-temp');
    const badgeTemp = document.getElementById('badge-temp');
    if (temp > thresholds.temp) {
        cardTemp.classList.add('card-danger-glow');
        badgeTemp.innerText = 'Estrés Térmico';
        badgeTemp.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 animate-pulse';
    } else {
        cardTemp.classList.remove('card-danger-glow');
        badgeTemp.innerText = 'Adecuado';
        badgeTemp.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600';
    }
}

// Data Fetching Logic
function startListening(view) {
    if (unsubscribe) unsubscribe();

    // Resetear valores visuales mientras carga
    document.getElementById('val-suelo1').innerText = '--';
    document.getElementById('val-suelo2').innerText = '--';
    document.getElementById('val-aire').innerText = '--';
    document.getElementById('val-temp').innerText = '--';
    
    // Limpiar gráficas
    [chartSuelo, chartAire, chartTemp].forEach(c => {
        c.data.labels = [];
        c.data.datasets.forEach(d => d.data = []);
        c.update();
    });

    let q;
    const colRef = collection(db, "telemetria");
    
    if (view === 'all') {
        q = query(colRef, orderBy("fecha", "desc"), limit(30));
    } else {
        q = query(colRef, where("id_vitrina", "==", Number(view)), orderBy("fecha", "desc"), limit(30));
    }

    unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(`Datos recibidos para vista: ${view}, cantidad: ${snapshot.size}`);
        
        const labels = [];
        const suelo1 = [];
        const suelo2 = [];
        const aireHum = [];
        const aireTemp = [];

        const docs = snapshot.docs.reverse();
        currentTelemetryDocs = snapshot.docs; // Guardar copia para exportar a Excel

        docs.forEach((doc, index) => {
            const data = doc.data();
            const time = data.fecha.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            
            labels.push(time);
            suelo1.push(data.suelo1);
            suelo2.push(data.suelo2);
            aireHum.push(data.aire_hum);
            aireTemp.push(data.aire_temp);

            if (index === docs.length - 1) {
                document.getElementById('val-suelo1').innerText = data.suelo1;
                document.getElementById('val-suelo2').innerText = data.suelo2;
                document.getElementById('val-aire').innerText = data.aire_hum;
                document.getElementById('val-temp').innerText = data.aire_temp;

                // Evaluar umbrales dinámicamente en el último registro
                evaluateThresholds(data.suelo1, data.suelo2, data.aire_hum, data.aire_temp);
            }
        });

        chartSuelo.data.labels = labels;
        chartSuelo.data.datasets[0].data = suelo1;
        chartSuelo.data.datasets[1].data = suelo2;
        chartSuelo.update();

        chartAire.data.labels = labels;
        chartAire.data.datasets[0].data = aireHum;
        chartAire.update();

        chartTemp.data.labels = labels;
        chartTemp.data.datasets[0].data = aireTemp;
        chartTemp.update();

        if (docs.length > 0) {
            document.getElementById('last-update').innerText = `Sincronizado: ${new Date().toLocaleTimeString()}`;
        } else {
            document.getElementById('last-update').innerText = 'Sin datos recientes';
        }
    }, (error) => {
        console.error("Firestore Error:", error);
        if (error.code === 'failed-precondition') {
            document.getElementById('last-update').innerText = 'Error: Falta crear índice en Firebase';
        }
    });
}

// Escuchar Estado en Vivo del ESP32
const statusDocRef = doc(db, "estado", "dispositivo");
onSnapshot(statusDocRef, (docSnap) => {
    const banner = document.getElementById('esp32-status-banner');
    const liveIndicator = document.getElementById('live-indicator');
    const pingIndicator = document.getElementById('ping-indicator');
    const liveText = document.getElementById('live-text');
    
    if (docSnap.exists() && banner) {
        const status = docSnap.data();
        if (status.online) {
            banner.classList.add('hidden');
            if (liveIndicator) {
                liveIndicator.className = 'relative inline-flex rounded-full h-3 w-3 bg-emerald-500';
                pingIndicator.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
                liveText.innerText = 'En Vivo';
                liveText.className = 'text-sm font-semibold text-slate-600';
            }
        } else {
            banner.classList.remove('hidden');
            if (liveIndicator) {
                liveIndicator.className = 'relative inline-flex rounded-full h-3 w-3 bg-red-500';
                pingIndicator.className = 'hidden';
                liveText.innerText = 'Fuera de Línea';
                liveText.className = 'text-sm font-semibold text-red-500';
            }
            const lastSeen = status.lastSeen ? status.lastSeen.toDate() : null;
            if (lastSeen) {
                document.getElementById('last-seen-label').innerText = `Última vez visto: ${lastSeen.toLocaleTimeString('es-CO')}`;
            }
        }
    }
});

// Excel Export Button Action
const btnExportar = document.getElementById('btn-exportar');
if (btnExportar) {
    btnExportar.addEventListener('click', () => {
        if (currentTelemetryDocs.length === 0) {
            alert('No hay datos históricos disponibles para exportar en este momento.');
            return;
        }

        // Mapear los datos de Firebase a filas estructuradas de Excel
        const excelRows = currentTelemetryDocs.map((docSnap, index) => {
            const data = docSnap.data();
            let dateObj;
            if (data.fecha && typeof data.fecha.toDate === 'function') {
                dateObj = data.fecha.toDate();
            } else {
                dateObj = new Date();
            }
            
            const formattedDate = dateObj.toLocaleDateString('es-CO') + ' ' + dateObj.toLocaleTimeString('es-CO');
            
            return {
                'N°': index + 1,
                'Fecha y Hora': formattedDate,
                'ID Vitrina': data.id_vitrina,
                'Humedad Suelo 1 (pts)': data.suelo1,
                'Humedad Suelo 2 (pts)': data.suelo2,
                'Humedad Aire (%)': data.aire_hum,
                'Temperatura (°C)': data.aire_temp,
                'Estado Suelo 1': data.suelo1 < 300 ? 'Seco (Estrés Hídrico)' : 'Óptimo',
                'Estado Suelo 2': data.suelo2 < 300 ? 'Seco (Estrés Hídrico)' : 'Óptimo',
                'Estado Térmico': data.aire_temp > 35 ? 'Peligro: Calor' : 'Óptimo'
            };
        });

        // Crear una hoja de trabajo con SheetJS
        const worksheet = XLSX.utils.json_to_sheet(excelRows);

        // Definir anchos de columna automáticos
        const colWidths = [
            { wch: 6 },   // N°
            { wch: 22 },  // Fecha y Hora
            { wch: 12 },  // ID Vitrina
            { wch: 22 },  // Humedad Suelo 1
            { wch: 22 },  // Humedad Suelo 2
            { wch: 18 },  // Humedad Aire
            { wch: 18 },  // Temperatura
            { wch: 24 },  // Estado Suelo 1
            { wch: 24 },  // Estado Suelo 2
            { wch: 18 }   // Estado Térmico
        ];
        worksheet['!cols'] = colWidths;

        // Crear libro y agregar hoja
        const workbook = XLSX.utils.book_new();
        const sheetName = currentView === 'all' ? 'Resumen Global' : `Vitrina ${currentView}`;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // Descargar el archivo xlsx
        const viewText = currentView === 'all' ? 'Global' : `Vitrina_${currentView}`;
        const timestamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `Reporte_Telemetria_${viewText}_${timestamp}.xlsx`);
    });
}

// Sidebar Navigation
document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
        const view = link.getAttribute('data-view');
        currentView = view;
        
        // Update active class on both desktop and mobile sidebar buttons
        document.querySelectorAll('.sidebar-link').forEach(l => {
            if (l.getAttribute('data-view') === view) {
                l.classList.add('active');
            } else {
                l.classList.remove('active');
            }
        });
        
        const title = view === 'all' ? 'Resumen Global' : `Vitrina #${view}`;
        document.getElementById('current-title').innerText = title;
        document.getElementById('species-badge').innerText = speciesMap[view];

        // Close mobile drawer if it was opened
        toggleDrawer(false);

        // Start new data stream
        startListening(view);
    });
});

// Initial load
startListening('all');
