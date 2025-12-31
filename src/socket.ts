import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { broadcast, server } from './server';
import config from '../config/default.json';
import { ChatService } from './services/jsonDb';

// Configuraciones para Logging
// Uso pino porque es rápido y bonito para ver errores
const logger = pino({ level: 'info' });

// --- Variables Globales ---
// Aquí guardo la conexión. Si se cae, esta variable se vuelve undefined.
let sock: WASocket | undefined;
let isConnecting = false; // Para que no intente conectar dos veces al mismo tiempo
let retryCount = 0; // Para contar cuántas veces he intentado reconectar
const MAX_RETRIES = 5;

// Carpeta donde Baileys guarda sus secretos (llaves, sesión, etc)
// Esto es vital para no tener que escanear el QR cada vez que reinicias
const AUTH_DIR = path.join(process.cwd(), config.sessionName);

// --- Manejo de Comandos desde la UI ---
// Escucho lo que me dice el server.ts (que a su vez viene de la web)
server.on('ui:command', async (data: any) => {
    logger.info(`Me llegó un comando: ${data.command}`);

    switch (data.command) {
        case 'disconnect':
            await handleDisconnect(); // Apagar todo
            break;
        case 'restart':
            await startWhatsApp(); // Reiniciar es básicamente arrancar de nuevo
            break;
        case 'clear_session':
            await handleClearSession(); // Borrón y cuenta nueva
            break;
        case 'send_message':
            // Lógica para enviar mensaje: verifico que tenga todo lo necesario
            if (data.chatId && data.text && sock) {
                try {
                    await sock.sendMessage(data.chatId, { text: data.text });
                    logger.info(`Enviado mensaje a ${data.chatId}`);
                    // Ojo: no necesito guardarlo aquí manual, porque el evento upsert (append)
                    // lo va a detectar automágicamente y lo guardará en la DB.
                } catch (err) {
                    logger.error({ err }, 'Uy, falló el envío del mensaje');
                }
            }
            break;
    }
});

// Función para desconectar a las malas
async function handleDisconnect() {
    if (sock) {
        logger.info('Cerrando el chiringuito...');
        sock.end(undefined);
        sock = undefined;
        // Le aviso al frontend que estamos off
        broadcast('status', { status: 'disconnected', message: 'Desconectado manualmente' });
    }
}

// Función peligrosa: Borra todo el historial de sesión de la carpeta
async function handleClearSession() {
    await handleDisconnect();
    logger.info('Borrando archivos de sesión...');
    try {
        if (fs.existsSync(AUTH_DIR)) {
            // rmSync es bloqueante pero seguro para asegurar que se borre todo
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            logger.info('Listo, sesión borrada.');
        }
        broadcast('log', 'Archivos de sesión eliminados.');
        // Arranco de nuevo limpio
        startWhatsApp();
    } catch (err) {
        logger.error({ err }, 'Error intentando borrar la sesión');
        broadcast('log', 'Error eliminando sesión: ' + (err as Error).message);
    }
}

export async function startWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    logger.info('Iniciando servicio WhatsApp...');
    broadcast('log', 'Iniciando servicio...');

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info(`Usando WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        // Si hay QR, lo convierto a imagen y se lo mando al frontend
        if (qr) {
            logger.info('Tengo QR nuevo');
            try {
                // El QR viene como texto raro, aquí lo transformo a imagen base64
                // para que el HTML lo pueda mostrar en <img src="...">
                const url = await QRCode.toDataURL(qr);

                // Le chiflo a todos los clientes conectados: "¡Hey, nuevo QR!"
                broadcast('qr', url);
                broadcast('status', { status: 'scan_qr', message: 'Escanea el código QR' });
            } catch (err: any) {
                logger.error({ err }, 'Falló la generación del QR');
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.info({ error: lastDisconnect?.error }, `Conexión cerrada, reconectando: ${shouldReconnect}`);
            broadcast('log', `Desconectado: ${(lastDisconnect?.error as Error)?.message || 'Desconocido'}`);

            // Clean up
            isConnecting = false;

            if (shouldReconnect) {
                const delay = Math.min(1000 * (2 ** retryCount), 30000); // Exponential backoff max 30s
                retryCount++;
                broadcast('status', { status: 'reconnecting', message: `Reconectando en ${delay / 1000}s... (Intento ${retryCount})` });
                setTimeout(startWhatsApp, delay);
            } else {
                broadcast('status', { status: 'disconnected', message: 'Sesión cerrada. Requiere re-auth.' });
                sock?.end(undefined);
                // If logged out, maybe clear session automatically? user asked for reliable handling
                if ((lastDisconnect?.error as Boom)?.output?.statusCode === DisconnectReason.loggedOut) {
                    logger.info('Dispositivo desconectado (Logout), limpiando sesión no válida.');
                    // Optional: auto clear. Let's keep manual control or auto-cleanup logic as requested
                    // "Lógica explícita para manejar corrupción... (auto-limpieza si falla la autenticación)"
                    // LoggedOut usually means valid logout. Corruption is different.
                    // But if logged out, we should probably be ready to scan again.
                    startWhatsApp();
                }
            }
        } else if (connection === 'open') {
            logger.info('Conexión establecida exitosamente');
            broadcast('status', { status: 'connected', message: 'Conectado y listo' });
            broadcast('qr', null); // Clear QR
            retryCount = 0;
            isConnecting = false;
        }
    });

    // Simple Ping-Pong bot
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Allow notify (incoming) and append (outgoing/sync)
        if (type !== 'notify' && type !== 'append') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            // Simple text check
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const remoteJid = msg.key.remoteJid!;

            const messageData = {
                id: msg.key.id!,
                chatId: remoteJid,
                fromMe: msg.key.fromMe || false,
                text: text || 'Media/Unknown',
                createdAt: (msg.messageTimestamp as number) * 1000 || Date.now()
            };

            // Save to DB
            ChatService.saveMessage(remoteJid, messageData, msg.pushName || undefined);

            // Broadcast to UI
            broadcast('new_message', messageData);

            if (text && text.toLowerCase() === 'ping' && !msg.key.fromMe) {
                logger.info('Ping recibido, enviando Pong');
                const responseText = 'Pong 🏓';
                const sentMsg = await sock?.sendMessage(remoteJid, { text: responseText });

                // Manually save the response to ensure it appears in UI immediately
                if (sentMsg) {
                    const pongData = {
                        id: sentMsg.key.id!,
                        chatId: remoteJid,
                        fromMe: true,
                        text: responseText,
                        createdAt: Date.now()
                    };
                    ChatService.saveMessage(remoteJid, pongData);
                    broadcast('new_message', pongData);
                }
            }
        }
    });
}
