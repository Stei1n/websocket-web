import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'chats.json');

// Logs básicos para saber dónde está guardando
console.log('[JsonDB] Arrancando base de datos...');
console.log('[JsonDB] Archivo:', DB_FILE);

// --- Tipos de Datos ---
// Defino la forma que tienen mis mensajes y chats para que TS no se queje
export interface Message {
    id: string;
    chatId: string;
    fromMe: boolean;
    text: string | null;
    createdAt: number;
}

export interface Chat {
    id: string; // El numero de telefono o JID
    name?: string;
    updatedAt: number;
    messages: Message[];
}

// --- Memoria ---
// Cargo todo en RAM para que sea ultra rápido leer
let db: Record<string, Chat> = {};

// Al inicio, me aseguro que la carpeta data exista
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Si el archivo ya existe, lo leo. Si no, arranco vacío.
if (fs.existsSync(DB_FILE)) {
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        db = JSON.parse(raw);
    } catch (e) {
        console.error('Error leyendo la DB, voy a empezar de cero por seguridad', e);
        db = {};
    }
} else {
    // Si es la primera vez, creo el archivo
    saveDb();
}

// Función para guardar en disco (Persistencia)
function saveDb() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        console.log('[JsonDB] Guardado exitoso');
    } catch (e) {
        console.error('[JsonDB] Error grave guardando DB:', e);
    }
}

export const ChatService = {
    // Guardo un mensajito nuevo
    saveMessage: (chatId: string, message: Message, chatName?: string) => {
        // Si el chat no existe, lo invento
        if (!db[chatId]) {
            db[chatId] = {
                id: chatId,
                name: chatName || chatId,
                updatedAt: Date.now(),
                messages: []
            };
        }

        // Actualizo la fecha del chat para que suba en la lista
        db[chatId].updatedAt = Date.now();
        // Si me llega un nombre mejor (pushName), lo actualizo
        if (chatName && (!db[chatId].name || db[chatId].name === chatId)) {
            db[chatId].name = chatName;
        }

        // Importante: No guardar duplicados
        if (!db[chatId].messages.some(m => m.id === message.id)) {
            db[chatId].messages.push(message);

            // Truco: Solo guardo los últimos 100 mensajes para que el JSON no explote
            if (db[chatId].messages.length > 100) {
                db[chatId].messages = db[chatId].messages.slice(-100);
            }
            // Guardo cambios en disco
            saveDb();
        }
    },

    // Devuelvo la lista de chats ordenada por fecha (el más reciente arriba)
    getChats: () => {
        return Object.values(db).sort((a, b) => b.updatedAt - a.updatedAt).map(c => ({
            id: c.id,
            name: c.name,
            updatedAt: c.updatedAt,
            lastMessage: c.messages[c.messages.length - 1]?.text || 'Foto/Video'
        }));
    },

    // Devuelvo todos los mensajitos de un chat
    getMessages: (chatId: string) => {
        return db[chatId]?.messages || [];
    }
};
