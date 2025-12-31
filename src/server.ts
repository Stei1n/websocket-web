import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import config from '../config/default.json';
import { ChatService } from './services/jsonDb';

// Configuración básica de Express y WS
// Mantenemos todo en el mismo puerto para no complicarnos con CORS ni puertos extra
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware para entender JSON y servir el frontend (carpeta public)
app.use(express.json());
app.use(express.static(path.join(process.cwd(), config.publicDir)));

// --- API Endpoints ---

// Endpoint para obtener todos los chats al inicio
// Usamos un try-catch por si acaso falla la lectura del JSON
app.get('/api/chats', (req: Request, res: Response) => {
    try {
        console.log('[API] Pidiendo lista de chats...');
        res.json(ChatService.getChats());
    } catch (e) {
        console.error('[API] Uy, error al cargar chats:', e);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para ver los mensajes de un chat específico
app.get('/api/chats/:jid', (req: Request, res: Response) => {
    try {
        const { jid } = req.params;
        console.log(`[API] Cargando historia del chat: ${jid}`);
        res.json(ChatService.getMessages(jid));
    } catch (e) {
        console.error('[API] Error cargando mensajes:', e);
        res.status(500).json({ error: 'No se pudieron cargar los mensajes' });
    }
});

// Guardamos los clientes conectados aquí para mandarles info a todos
const clients = new Set<WebSocket>();

// Variables para "recordar" el último estado y no mandar info vacía al reconectar
let lastQR: string | null = null;
let lastStatus: { status: string, message: string } = { status: 'disconnected', message: 'Esperando información...' };

wss.on('connection', (ws: WebSocket) => {
    console.log('Nuevo cliente conectado al Dashboard');
    clients.add(ws);

    // Apenas se conecta, le mando lo que tengo guardado (QR o Estado)
    if (lastQR) {
        ws.send(JSON.stringify({ type: 'qr', payload: lastQR }));
    }
    ws.send(JSON.stringify({ type: 'status', payload: lastStatus }));

    ws.on('close', () => {
        clients.delete(ws);
    });

    // Aquí escucho comandos que vengan del botón del frontend
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            // Re-emito el evento para que lo agarre socket.ts
            server.emit('ui:command', data);
        } catch (e) {
            console.error('Llegó basura por WS, ignorando:', e);
        }
    });
});

// Función helper para mandarle datos a todos los navegadores abiertos
export const broadcast = (type: string, payload: any) => {
    // Actualizo el caché primero
    if (type === 'qr') lastQR = payload;
    if (type === 'status') lastStatus = payload;

    const data = JSON.stringify({ type, payload });
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

export { app, server, wss };
