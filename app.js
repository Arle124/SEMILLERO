import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD1k51cZUKoRaj2TL0uE54AKFlLh29XB14",
  authDomain: "vitrinasiot.firebaseapp.com",
  projectId: "vitrinasiot",
  storageBucket: "vitrinasiot.firebasestorage.app",
  messagingSenderId: "561450941909",
  appId: "1:561450941909:web:029947d932a8211a89915c",
  measurementId: "G-X35634Y50Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global Chart Config
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.color = '#64748b';

const createChartOptions = (showLegend = false) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: showLegend,
            position: 'top',
            labels: { usePointStyle: true, boxWidth: 6 }
        },
        tooltip: {
            backgroundColor: '#1e293b',
            padding: 12,
            titleFont: { size: 14, weight: 'bold' },
            callbacks: {
                label: (context) => ` ${context.dataset.label}: ${context.parsed.y}`
            }
        }
    },
    scales: {
        y: {
            grid: { color: '#f1f5f9' },
            border: { display: false }
        },
        x: {
            grid: { display: false },
            border: { display: false }
        }
    }
});

// Soil Chart
const ctxSuelo = document.getElementById('chartSuelo').getContext('2d');
const chartSuelo = new Chart(ctxSuelo, {
    type: 'line',
    data: { labels: [], datasets: [
        { 
            label: 'Suelo 1', 
            data: [], 
            borderColor: '#3b82f6', 
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 6
        },
        { 
            label: 'Suelo 2', 
            data: [], 
            borderColor: '#06b6d4', 
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 6
        }
    ]},
    options: createChartOptions(true)
});

// Air Humidity Chart
const ctxAire = document.getElementById('chartAire').getContext('2d');
const chartAire = new Chart(ctxAire, {
    type: 'line',
    data: { labels: [], datasets: [{ 
        label: 'Humedad', 
        data: [], 
        borderColor: '#10b981', 
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 0
    }] },
    options: createChartOptions()
});

// Temperature Chart
const ctxTemp = document.getElementById('chartTemp').getContext('2d');
const chartTemp = new Chart(ctxTemp, {
    type: 'line',
    data: { labels: [], datasets: [{ 
        label: 'Temp', 
        data: [], 
        borderColor: '#f59e0b', 
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 0
    }] },
    options: createChartOptions()
});

// Real-time Data Listener
const q = query(collection(db, "telemetria"), orderBy("fecha", "desc"), limit(24));

onSnapshot(q, (snapshot) => {
    const labels = [];
    const suelo1 = [];
    const suelo2 = [];
    const aireHum = [];
    const aireTemp = [];

    const docs = snapshot.docs.reverse();

    docs.forEach((doc, index) => {
        const data = doc.data();
        const time = data.fecha.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        
        labels.push(time);
        suelo1.push(data.suelo1);
        suelo2.push(data.suelo2);
        aireHum.push(data.aire_hum);
        aireTemp.push(data.aire_temp);

        // Update Big Metrics with latest record
        if (index === docs.length - 1) {
            document.getElementById('val-suelo1').innerText = data.suelo1;
            document.getElementById('val-suelo2').innerText = data.suelo2;
            document.getElementById('val-aire').innerText = data.aire_hum;
            document.getElementById('val-temp').innerText = data.aire_temp;
            document.getElementById('vitrina-id').innerText = `Vitrina #${data.id_vitrina || 1}`;
        }
    });

    // Update Charts
    chartSuelo.data.labels = labels;
    chartSuelo.data.datasets[0].data = suelo1;
    chartSuelo.data.datasets[1].data = suelo2;
    chartSuelo.update('none'); // Update without animation for smoother real-time feel

    chartAire.data.labels = labels;
    chartAire.data.datasets[0].data = aireHum;
    chartAire.update('none');

    chartTemp.data.labels = labels;
    chartTemp.data.datasets[0].data = aireTemp;
    chartTemp.update('none');

    if (docs.length > 0) {
        document.getElementById('last-update').innerText = `Sincronizado: ${new Date().toLocaleTimeString()}`;
    }
});
