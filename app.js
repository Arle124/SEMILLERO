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

// Configuración de Gráficas
const commonOptions = {
    responsive: true,
    scales: { y: { beginAtZero: true } },
    plugins: { legend: { display: false } }
};

const ctxSuelo = document.getElementById('chartSuelo').getContext('2d');
const chartSuelo = new Chart(ctxSuelo, {
    type: 'line',
    data: { labels: [], datasets: [
        { label: 'Suelo 1', data: [], borderColor: '#3498db', tension: 0.3 },
        { label: 'Suelo 2', data: [], borderColor: '#2980b9', tension: 0.3 }
    ]},
    options: commonOptions
});

const ctxAire = document.getElementById('chartAire').getContext('2d');
const chartAire = new Chart(ctxAire, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#2ecc71', tension: 0.3 }] },
    options: commonOptions
});

const ctxTemp = document.getElementById('chartTemp').getContext('2d');
const chartTemp = new Chart(ctxTemp, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#e67e22', tension: 0.3 }] },
    options: commonOptions
});

// Escuchar datos de Firestore en tiempo real
const q = query(collection(db, "telemetria"), orderBy("fecha", "desc"), limit(20));

onSnapshot(q, (snapshot) => {
    const labels = [];
    const suelo1 = [];
    const suelo2 = [];
    const aireHum = [];
    const aireTemp = [];

    const docs = snapshot.docs.reverse(); // Ordenar de viejo a nuevo para la gráfica

    docs.forEach(doc => {
        const data = doc.data();
        const hora = data.fecha.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        
        labels.push(hora);
        suelo1.push(data.suelo1);
        suelo2.push(data.suelo2);
        aireHum.push(data.aire_hum);
        aireTemp.push(data.aire_temp);
    });

    // Actualizar gráficas
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
        document.getElementById('last-update').innerText = `Última actualización: ${new Date().toLocaleTimeString()}`;
    }
});
