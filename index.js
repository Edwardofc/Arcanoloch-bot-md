const fs = require('fs-extra');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const now = require('performance-now');

const SESSION_BASE = './sessions/';
fs.ensureDirSync(SESSION_BASE);

async function iniciarWhatsApp(sessionFolder = 'default') {
    const sessionPath = `${SESSION_BASE}${sessionFolder}`;
    fs.ensureDirSync(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['Linux', 'Chrome', '120.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);
    
        // ======================================
    // SISTEMA DE BIENVENIDAS/DESPEDIDAS (NUEVO)
    // ======================================
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            if (!id.endsWith('@g.us')) return;

            const groupMetadata = await sock.groupMetadata(id);
            const groupName = groupMetadata.subject || "este grupo";
            const groupDesc = groupMetadata.desc || "No hay descripción disponible";
            
            // Obtener lista de administradores
            const admins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);

 for (const participant of participants) {
    try {
     if (action === 'add') {
      // Mensaje de bienvenida
        await sock.sendMessage(id, {
         text:
`*¡BIENVENIDO/A Al ${groupName.toUpperCase()}!*\n
┆ ➣ @${participant.split('@')[0]}!* `+
     
`📌 *DESCRIPCIÓN:*
${groupDesc}\n\n`+

`👑 *ADMINISTRADORES:*
┆ ➣ ${admins.map(a => `@${a.split('@')[0]}`).join(' ')}\n\n` +

`_© By Arcanoloch-Group_`,
     mentions: [participant, ...admins]
     });
    
      // Sticker de bienvenida (opcional)
    await sock.sendMessage(id, {
       sticker: { 
    url: 'https://raw.githubusercontent.com/WhatsApp/stickers/main/Android/app/src/main/assets/1/01_Cuppy_smile.webp' 
                            }
                        });

  } else if (action === 'remove') {
    // Mensaje de despedida
    await sock.sendMessage(id, {
    text: `😢 *@${participant.split('@')[0]}* HA ABANDONADO EL GRUPO\n\n` +
   `¡Hasta pronto! 👋\n\n` +
      `_© By Arcanoloch-Group_`,
      mentions: [participant]
                        });

  // Sticker de despedida (opcional)
       await sock.sendMessage(id, {
         sticker: { }
             });
         }
      } catch (error) {
    console.error(chalk.red(`❌ Error en ${action === 'add' ? 'bienvenida' : 'despedida'}:`), error);
                }
            }
        } catch (error) {
            console.error(chalk.red('❌ Error en sistema de bienvenidas/despedidas:'), error);
        }
    });


    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(chalk.red('\n🔒 Sesión cerrada. Borra la carpeta para reiniciar.'));
                process.exit(0);
            }

            if (statusCode === DisconnectReason.restartRequired || statusCode === 405) {
                console.log(chalk.red('\n🚫 Reinicio requerido (código 405).'));
                console.log(chalk.yellow('🧼 Borra la carpeta de sesión y reinicia.'));
                process.exit(1);
            }

            console.log(chalk.red(`\n⚠️ Desconectado. Código: ${statusCode}`));
            process.exit(1);
        }

        if (qr) {
            mostrarOpcionesDeInicio(qr);
        }

        if (connection === 'open') {
            console.log(chalk.green('\n✅ Conectado exitosamente a WhatsApp.'));
            require('./main')(sock);
        }
    });
}

function mostrarOpcionesDeInicio(qr) {
    console.clear();
    console.log(chalk.blue.bold('\n🔐 Elige un método para conectar tu WhatsApp:'));
    console.log('1️⃣ Escanear código QR');
    console.log('2️⃣ Ingresar código de 8 dígitos\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(chalk.yellow('👉 Escribe 1 o 2: '), async (answer) => {
        if (answer === '1') {
            console.log(chalk.green('\n📲 Escanea este código QR:\n'));
            qrcode.generate(qr, { small: true });
            rl.close();
        } else if (answer === '2') {
            rl.question(chalk.cyan('\n🔑 Ingresa el código de 8 dígitos: '), async (code) => {
                rl.close();
                const sessionFolder = code.trim();
                const rutaSesion = `${SESSION_BASE}${sessionFolder}/creds.json`;

                if (await fs.pathExists(rutaSesion)) {
                    console.log(chalk.green('\n✅ Código válido. Usando sesión existente...\n'));
                    iniciarWhatsApp(sessionFolder);
                } else {
                    console.log(chalk.red('\n❌ Código inválido o sesión no encontrada.'));
                    process.exit(1);
                }
            });
        } else {
            console.log(chalk.red('\n❌ Opción inválida.'));
            rl.close();
            process.exit(1);
        }
    });
}

iniciarWhatsApp();

process.on('unhandledRejection', (err) => {
    console.error(chalk.red('\n❌ Error no manejado:'), err);
});
  
