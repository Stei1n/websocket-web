// Me conecto al WebSocket (el canal en vivo con el servidor)
const ws = new WebSocket(`ws://${location.host}`);

// Agarro los elementos del DOM que voy a usar
const statusEl = document.getElementById('connection-status');
const statusDot = statusEl.querySelector('.dot');
const statusText = statusEl.querySelector('.text');
const qrContainer = document.getElementById('qr-container');
const qrImage = document.getElementById('qr-image');
const logsContainer = document.getElementById('logs-container');

// Botones de acción del Dashboard
// Uso sendCommand para mandar JSON al server
document.getElementById('btn-disconnect').addEventListener('click', () => sendCommand({ command: 'disconnect' }));
document.getElementById('btn-restart').addEventListener('click', () => sendCommand({ command: 'restart' }));
document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('¿Estás seguro de borrar la sesión y reiniciar?')) {
        sendCommand({ command: 'clear_session' });
    }
});

// Escucho eventos que vengan de otros scripts (como el chat.js)
window.addEventListener('wa:send_command', (e) => {
    sendCommand(e.detail);
});

// Función central para hablar con el Backend
function sendCommand(data) {
    if (typeof data === 'string') data = { command: data }; // Compatibilidad hacia atrás
    ws.send(JSON.stringify(data));
    // Solo logueo comandos de sistema, no cada mensaje de chat
    if (data.command !== 'send_message') {
        addLog(`Comando enviado: ${data.command}`);
    }
}

function addLog(message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsContainer.prepend(entry);
}

// Cuando abre la conexión...
ws.onopen = () => {
    console.log('WS Listo y conectado');
    addLog('Conectado al servidor de control');
};

// MAEJO DE MENSAJES QUE LLEGAN DEL SERVIDOR
ws.onmessage = (event) => {
    try {
        const { type, payload } = JSON.parse(event.data);

        switch (type) {
            case 'qr':
                // Si llega QR, lo muestro. Si llega null, lo oculto.
                if (payload) {
                    qrImage.src = payload;
                    qrImage.style.display = 'block';
                    qrContainer.querySelector('p')?.remove();
                } else {
                    qrImage.style.display = 'none';
                }
                break;

            case 'status':
                updateStatus(payload.status, payload.message);
                addLog(`Cambio de Estado: ${payload.message}`);
                break;

            case 'log':
                addLog(payload);
                break;

            case 'new_message':
                // IMPORTANTE: Esto le avisa a todo el sitio que llegó un mensaje nuevo
                // El chat.js va a escuchar este evento
                window.dispatchEvent(new CustomEvent('wa:message', { detail: payload }));
                break;
        }
    } catch (e) {
        console.error('Llegó algo raro por WS', e);
    }
};

function updateStatus(status, message) {
    statusEl.className = `status-indicator ${status}`;
    statusText.textContent = message;

    // Si ya conectó, escondo el QR por las dudas
    if (status === 'connected') {
        qrImage.style.display = 'none';
    }
}

ws.onclose = () => {
    addLog('Se perdió la conexión con el servidor (WS Close)');
    updateStatus('disconnected', 'Desconectado del servidor');
};
