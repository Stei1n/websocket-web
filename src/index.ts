import { server, broadcast } from './server';
import { startWhatsApp } from './socket'; // Removed 'sock' since it's not exported
import config from '../config/default.json';

const PORT = config.port || 3000;

// Start Server
server.listen(PORT, () => {
    console.log(`\nServidor corriendo en http://localhost:${PORT}`);
    console.log(`Panel de Control: http://localhost:${PORT}`);

    // Start WhatsApp Service
    startWhatsApp().catch(err => {
        console.error('Fallo fatal iniciando WhatsApp:', err);
        // process.exit(1); // Don't kill server if WA fails
    });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Apagando servidor...');
    process.exit(0);
});
