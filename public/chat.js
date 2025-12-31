// --- Referencias al HTML ---
const chatListEl = document.getElementById('chat-list');
const messagesContainer = document.getElementById('messages-container');
const chatHeader = document.getElementById('chat-header');
const currentChatName = document.getElementById('current-chat-name');
const btnDashboard = document.getElementById('btn-dashboard');
const btnChats = document.getElementById('btn-chats');
const viewDashboard = document.getElementById('view-dashboard');
const viewChats = document.getElementById('view-chats');

let activeChatId = null;

// Referencias para el input de texto
const chatInputArea = document.getElementById('chat-input-area');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');

// --- Event Listeners ---
btnSend.addEventListener('click', sendMessage);
// Permito enviar con Enter para que sea más natural
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Función para enviar mensaje
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatId) return;

    // Aquí despacho un evento custom que 'app.js' va a agarrar
    // Hago esto para no tener que importar el WebSocket aquí
    window.dispatchEvent(new CustomEvent('wa:send_command', {
        detail: { command: 'send_message', chatId: activeChatId, text }
    }));

    messageInput.value = '';
}

// --- Navegación entre Pestañas ---
btnDashboard.addEventListener('click', () => switchView('dashboard'));
btnChats.addEventListener('click', () => switchView('chats'));

function switchView(view) {
    if (view === 'dashboard') {
        viewDashboard.style.display = 'block';
        viewChats.style.display = 'none';
        btnDashboard.classList.add('active');
        btnChats.classList.remove('active');
    } else {
        viewDashboard.style.display = 'none';
        viewChats.style.display = 'block';
        btnDashboard.classList.remove('active');
        btnChats.classList.add('active');
        // Cuando entro a chats, recargo la lista
        loadChats();
    }
}

// Carga la lista de chats desde la API
async function loadChats() {
    chatListEl.innerHTML = '<div class="chat-loading">Cargando...</div>';
    try {
        const res = await fetch('/api/chats');
        const chats = await res.json();
        renderChatList(chats);
    } catch (e) {
        chatListEl.innerHTML = '<div class="error">Error cargando chats</div>';
    }
}

function renderChatList(chats) {
    chatListEl.innerHTML = '';
    if (chats.length === 0) {
        chatListEl.innerHTML = '<div class="empty">No hay chats guardados</div>';
        return;
    }

    chats.forEach(chat => {
        const item = document.createElement('div');
        // Si es el chat que tengo abierto, le pongo la clase active
        item.className = `chat-item ${activeChatId === chat.id ? 'active' : ''}`;
        item.onclick = () => loadMessages(chat);

        const date = new Date(chat.updatedAt).toLocaleDateString();

        item.innerHTML = `
            <div class="chat-info">
                <div class="chat-name">${chat.name || chat.id}</div>
                <div class="chat-last-msg">${chat.lastMessage.substring(0, 30)}...</div>
            </div>
            <div class="chat-meta">${date}</div>
        `;
        chatListEl.appendChild(item);
    });
}

// Carga los mensajes de un chat específico
async function loadMessages(chat) {
    activeChatId = chat.id;

    // UI Updates
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    currentChatName.textContent = chat.name || chat.id;
    chatHeader.style.display = 'block';
    chatInputArea.style.display = 'flex'; // Muestro el input
    messagesContainer.innerHTML = '<div class="loading">Cargando mensajes...</div>';

    try {
        const res = await fetch(`/api/chats/${chat.id}`);
        const messages = await res.json();
        renderMessages(messages);
    } catch (e) {
        messagesContainer.innerHTML = '<div class="error">Error cargando mensajes</div>';
    }
}

function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
        const bubble = document.createElement('div');
        // Clase condicional: outgoing (verde) o incoming (blanco)
        bubble.className = `message-bubble ${msg.fromMe ? 'outgoing' : 'incoming'}`;

        const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubble.innerHTML = `
            <div class="msg-text">${msg.text || 'Unsupported message type'}</div>
            <div class="msg-time">${time}</div>
        `;
        messagesContainer.appendChild(bubble);
    });
    // Scroll al final para ver lo nuevo
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Listener de Tiempo Real ---
// Cuando llega un mensaje nuevo por WebSocket...
window.addEventListener('wa:message', (e) => {
    const msg = e.detail;

    // 1. Si tengo el chat abierto, lo agrego abajo de todo
    if (activeChatId === msg.chatId) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${msg.fromMe ? 'outgoing' : 'incoming'}`;
        const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        bubble.innerHTML = `
            <div class="msg-text">${msg.text || 'Media'}</div>
            <div class="msg-time">${time}</div>
        `;
        messagesContainer.appendChild(bubble);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 2. Siempre recargo la lista para que el chat suba al primer puesto
    loadChats();
});
