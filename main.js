const fs = require('fs-extra');
const path = require('path');
const AUCTION_FOLDER = './subastas';
fs.ensureDirSync(AUCTION_FOLDER);
const chalk = require('chalk');
const now = require('performance-now');
const DB_PATH = path.join(__dirname, 'database.json');
const nodemailer = require('nodemailer');
const { generateWAMessageFromContent, generateForwardMessageContent } = require('@whiskeysockets/baileys');
const axios = require('axios') ;
const carritos = {}; // clave: número, valor: array de ítems
const BANDERAS = {
    peru: '🇵🇪', mexico: '🇲🇽', argentina: '🇦🇷', chile: '🇨🇱',
    colombia: '🇨🇴', españa: '🇪🇸', cuba: '🇨🇺', venezuela: '🇻🇪',
    brasil: '🇧🇷', usa: '🇺🇸', francia: '🇫🇷', alemania: '🇩🇪'
};
function getCurrencySymbol(name) {
    switch (name.toLowerCase()) {
        case 'dólar':
        case 'dolar':
            return '$';
        case 'euro':
            return '€';
        case 'yen':
            return '¥';
        case 'peso':
            return '₱';
        case 'soles':
        case 'sol':
            return 'S/';
        default:
            return name; // Si no coincide, devuelve el nombre original
    }
}
let DB = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH)) : {};
function guardarDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 2));
}

function generarUserID() {
    return Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
}

function generarShopID() {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numeros = '0123456789';
    let id = '';
    for (let i = 0; i < 3; i++) id += letras[Math.floor(Math.random() * letras.length)];
    for (let i = 0; i < 3; i++) id += numeros[Math.floor(Math.random() * numeros.length)];
    return `N° ${id}`;
}

function textoABinario(texto) {
    return texto.split('').map(char => char.charCodeAt(0).toString(2)).join(' ');
}

module.exports = async function main(sock) {
    const prefix = '.';

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');

            let senderJid = isGroup ? msg.key.participant : msg.key.remoteJid;
            if (!senderJid || !senderJid.includes('@')) {
                senderJid = msg.participant || msg.pushName || msg.key.remoteJid;
            }

            let numero = senderJid.replace(/[^0-9]/g, '');
            if (numero.length < 9 || numero.length > 15 || isNaN(numero)) {
                console.log(chalk.red(`⚠️ Número no válido: ${numero}. Se ignora.`));
                return;
            }

            const body =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                msg.message.buttonsResponseMessage?.selectedButtonId ||
                '';

            if (!body.startsWith(prefix)) return;

            const args = body.slice(prefix.length).trim().split(/\s+/);
            const command = args.shift().toLowerCase();

            console.log(
                chalk.cyan('\n📥 COMANDO RECIBIDO') +
                chalk.gray('\n──────────────────────')
            );
            console.log(chalk.yellow(`🟢 Chat: ${isGroup ? 'Grupo' : 'Privado'}`));
            console.log(chalk.blue('🔗 Chat ID:'), chalk.white(from));
            console.log(chalk.magenta('👤 Usuario JID:'), chalk.white(senderJid));
            console.log(chalk.green('📱 Número:'), chalk.white(numero));
            console.log(chalk.green('💬 Mensaje:'), chalk.white(body));
            console.log(chalk.gray('──────────────────────'));

            switch (prefix && command) {
                case 'menu':
                    await sock.sendMessage(from, {
                        text:
`📋 *MENÚ PRINCIPAL* 📋
╔═══════════════════════
║  🤖 *COMANDOS BÁSICOS*  
╠═══════════════════════
║ • ${prefix}ping ➜ Verifica el estado del bot
║ • ${prefix}help ➜ Muestra este menú de ayuda
║ 
║  📝 *REGISTRO*  
╠═══════════════════════
║ • ${prefix}reg nombre-edad-país-género 
║   ➜ Registra tu información (Ej: /reg Carlos-25-México-Hombre)
║ 
║  👤 *PERFIL*  
╠═══════════════════════
║ • ${prefix}perfil ➜ Muestra tu perfil registrado
║ • ${prefix}mifoto ➜ Configura tu foto de perfil
║ 
║  🔄 *ACTUALIZAR DATOS*  
╠═══════════════════════
║ • ${prefix}cambiarnombre [nuevo] ➜ Actualiza tu nombre
║ • ${prefix}cambiaredad [nueva] ➜ Modifica tu edad
╚═══════════════════════
📌 *Ejemplos:* 
• "${prefix}reg Ana-22-España-Mujer"
• "${prefix}perfil"`
                    });
                    break;

 case 'ping': {
                    const start = now();
                    const end = now();
                    const latency = end - start;

                    await sock.sendMessage(from, {
                        text: `*Pong 📡 ${latency.toFixed(4)} ms*`
                    }, {
                        quoted: msg,
                        ephemeralExpiration: 24 * 60 * 1000,
                        disappearingMessagesInChat: 24 * 60 * 1000
                    });
                    break;
                }
case 'reg': {
    if (isGroup) {
        await sock.sendMessage(from, {
            text: '❌ El registro solo está permitido en *chat privado*.'
        }, { quoted: msg });
        break;
    }

    if (!args[0]) {
        await sock.sendMessage(from, {
            text: '❗ Formato inválido. Usa:\n`.reg nombre-edad-país-correo-sexo`\nEjemplo:\n`.reg Jeff-38-Cuba-jeff027@gmail.com-h`'
        }, { quoted: msg });
        break;
    }

    const info = args[0].split('-');
    if (info.length !== 5) {
        await sock.sendMessage(from, {
            text: '❗ Datos incompletos. Asegúrate de usar el formato:\n`.reg nombre-edad-país-correo-sexo`'
        }, { quoted: msg });
        break;
    }

    const [nombre, edad, pais, correo, generoInput] = info;
    const genero = generoInput.toLowerCase();
    const numero = senderJid.replace(/[^0-9]/g, '');
    const bandera = BANDERAS[pais.toLowerCase()] || '🏳️';

    if (DB[numero]) {
        await sock.sendMessage(from, {
            text: '📌 Ya estás registrado. Usa `.perfil` para ver tus datos.'
        }, { quoted: msg });
        break;
    }

    let generoFinal = '';
    if (genero === 'h') generoFinal = 'Hombre 🙋🏻‍♂️';
    else if (genero === 'm') generoFinal = 'Mujer 🙋🏻';
    else generoFinal = 'LGBT 🏳️‍🌈';

    const userID = generarUserID();
    const shopID = generarShopID();
    const userCode = textoABinario(`${nombre}${userID}`);

    DB[numero] = {
        user: {
            name: nombre,
            rol: 'usuario',
            edad,
            correo,
            pais,
            genero: generoFinal,
            id: userID,
            telef: numero,
            code: userCode,
            coin: 20
        },
        shop: {
            id: shopID
        }
    };

    guardarDB();

    await sock.sendMessage(from, {
        text: `✅ *DATOS REGISTRADOS*\n\n` +
              `👤 Nombre: ${nombre}\n` +
              `📧 Correo: ${correo}\n` +
              `🆔 ID: ${userID}\n` +
              `🛒 Shop ID: ${shopID}\n` +
              `💰 Coin: 20\n` +
              `📞 Teléfono: ${numero}\n` +
              `🌍 País: ${pais} ${bandera}\n` +
              `⚧️ Género: ${generoFinal}\n` +
              `🔐 Token generado (binario):\n${userCode}`
    }, { quoted: msg });

    break;
}
case 'perfil': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const usuario = DB[numero];

    if (!usuario) {
        await sock.sendMessage(from, {
            text: '❌ No estás registrado. Usa `.reg nombre-edad-país-correo-sexo` para registrarte.'
        }, { quoted: msg });
        break;
    }

    const { name, rol, edad, pais, correo, genero, id, telef, code, coin } = usuario.user;
    const shopID = usuario.shop?.id || 'N/A';
    const bandera = BANDERAS[pais.toLowerCase()] || '🏳️';

    await sock.sendMessage(from, {
        text: `👤 *PERFIL DE USUARIO*\n\n` +
              `📛 *Nombre:* ${name}\n` +
              `🎭 *Rol:* ${rol}\n` +
              `📧 *Correo:* ${correo}\n` +
              `🎂 *Edad:* ${edad} años\n` +
              `🌍 *País:* ${pais} ${bandera}\n` +
              `⚧️ *Género:* ${genero}\n` +
              `🆔 *ID:* ${id}\n` +
              `🛒 *Shop ID:* ${shopID}\n` +
              `📞 *Teléfono:* ${telef}\n` +
              `💰 *Coin:* ${coin}\n` +
              `🔐 *Token (binario):*\n${code}`
    }, { quoted: msg });

    break;
}
case 'shop': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const usuario = DB[numero];

    if (!usuario) {
        await sock.sendMessage(from, {
            text: '❌ No estás registrado. Usa `.reg nombre-edad-país-correo-sexo` para acceder a la tienda.'
        }, { quoted: msg });
        break;
    }

    const nombre = usuario.user?.name || 'Desconocido';
    const shopID = usuario.shop?.id || 'N/A';

    await sock.sendMessage(from, {
        text:
`🛒 *MENÚ SHOP* 🛒

👤 *Nombre:* ${nombre}
🛍️ *Shop ID:* ${shopID}

📦 *Opciones disponibles:*
${prefix}coín ➜ Ver tu saldo
${prefix}pico ➜ Comprar pico de minería
`
    }, { quoted: msg });

    break;
}



case 'traducir':
case 'translate':
case 'tr': {
    try {
        // Importación compatible con todas las versiones
        const translateModule = require('@vitalets/google-translate-api');
        const translate = translateModule.translate || translateModule.default || translateModule;
        
        const idiomas = {
            'es': '🇪🇸 Español',
            'en': '🇬🇧 Inglés',
            'pt': '🇵🇹 Portugués',
            'fr': '🇫🇷 Francés',
            // Agrega más idiomas según necesites
        };

        if (!args || args.length < 2) {
            let listaIdiomas = Object.entries(idiomas).map(([cod, nombre]) => `• ${cod}: ${nombre}`).join('\n');
            await sock.sendMessage(from, {
                text: `📝 *Formato:* ${prefix}tr [idioma] [texto]\n\n🌍 *Idiomas disponibles:*\n${listaIdiomas}\n\nEjemplo: ${prefix}tr en Hola amigos`
            }, { quoted: msg });
            return;
        }

        const lang = args[0].toLowerCase();
        const text = args.slice(1).join(' ');

        // Verificar si el idioma es válido
        if (!idiomas[lang]) {
            await sock.sendMessage(from, {
                text: `❌ Idioma no soportado. Usa ${prefix}tr sin texto para ver idiomas disponibles.`
            }, { quoted: msg });
            return;
        }

        // Realizar la traducción
        const result = await translate(text, { to: lang });
        
        await sock.sendMessage(from, {
            text: `🌍 *Traducción (${idiomas[lang]}):*\n${result.text}\n\n🔍 *Original (${idiomas['es']}):*\n${text}`
        }, { quoted: msg });

    } catch (error) {
        console.error('Error en traducción:', error);
        await sock.sendMessage(from, {
            text: `❌ Error al traducir: ${error.message}\n\nPrueba nuevamente o usa un texto más corto.`
        }, { quoted: msg });
    }
    break;
}

//------ shop
case 'shop': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const usuario = DB[numero];

    if (!usuario) {
        await sock.sendMessage(from, {
            text: '❌ No estás registrado. Usa `.reg nombre-edad-país-correo-sexo` para acceder a la tienda.'
        }, { quoted: msg });
        break;
    }

    const nombre = usuario.user?.name || 'Desconocido';
    const shopID = usuario.shop?.id || 'N/A';

    await sock.sendMessage(from, {
        text:
`🛒 *MENÚ SHOP* 🛒

👤 *Nombre:* ${nombre}
🛍️ *Shop ID:* ${shopID}

📦 *Opciones disponibles:*
${prefix}coín ➜ Ver tu saldo
${prefix}pico ➜ Comprar pico de minería
`
    }, { quoted: msg });

    break;
}

case 'coin': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const usuario = DB[numero];

    if (!usuario) {
        await sock.sendMessage(from, {
            text: '❌ No estás registrado. Usa `.reg nombre-edad-país-correo-sexo` para acceder a la tienda.'
        }, { quoted: msg });
        break;
    }

    const nombre = usuario.user?.name || 'Desconocido';
    const shopID = usuario.shop?.id || 'N/A';

    carritos[numero] = []; // inicializa carrito vacío

    await sock.sendMessage(from, {
        text:
`🛒 *SHOP COÍN* 🛒

👤 *Nombre:* ${nombre}
🛍️ *Shop ID:* ${shopID}

¿Deseas agregar artículos al carrito?

Escribe:
${prefix}agregar 10coin
${prefix}agregar pico

Luego escribe:
${prefix}carrito ➜ Para ver tu carrito
${prefix}confirmar ➜ Para confirmar la compra
${prefix}cancelar ➜ Para cancelar la compra`
    }, { quoted: msg });

    break;
}
case 'agregar': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const item = args.join(' ').toLowerCase();

    if (!carritos[numero]) carritos[numero] = [];

    if (!item) {
        await sock.sendMessage(from, {
            text: '❗ Especifica qué artículo deseas agregar. Ejemplo:\n.agregar 10coin'
        }, { quoted: msg });
        break;
    }

    carritos[numero].push(item);

    await sock.sendMessage(from, {
        text: `✅ Artículo *${item}* agregado al carrito.`
    }, { quoted: msg });

    break;
}
case 'carrito': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const usuario = DB[numero];
    const carrito = carritos[numero] || [];

    if (!usuario || carrito.length === 0) {
        await sock.sendMessage(from, {
            text: '🛒 Tu carrito está vacío.'
        }, { quoted: msg });
        break;
    }

    const nombre = usuario.user?.name || 'Desconocido';
    const shopID = usuario.shop?.id || 'N/A';
    const lista = carrito.map(i => `✓ ${i}`).join('\n');

    await sock.sendMessage(from, {
        text:
`🧾 *CARRITO DE COMPRA*

👤 Nombre: ${nombre}
🛍️ Shop ID: ${shopID}

🛒 Artículos:
${lista}

¿Deseas confirmar o cancelar?

${prefix}confirmar
${prefix}cancelar`
    }, { quoted: msg });

    break;
}
case 'confirmar': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    const usuario = DB[numero];
    const carrito = carritos[numero] || [];

    if (!usuario || carrito.length === 0) {
        await sock.sendMessage(from, {
            text: '❌ No tienes artículos en tu carrito.'
        }, { quoted: msg });
        break;
    }

    const nombre = usuario.user?.name || 'Desconocido';
    const shopID = usuario.shop?.id || 'N/A';
    const lista = carrito.map(i => `✓ ${i}`).join('\n');

    // Aquí podrías descontar coin si lo deseas

    await sock.sendMessage(from, {
        text: `✅ Compra confirmada.\n\n🧾 Artículos:\n${lista}`
    }, { quoted: msg });

    // Notificación al dueño
    await sock.sendMessage('51994729892@s.whatsapp.net', {
        text:
`📦 *COMPRA CONFIRMADA*

👤 Nombre: ${nombre}
🛍️ Shop ID: ${shopID}

🛒 Artículos:
${lista}

✅ Se confirmó la compra.`
    });

    delete carritos[numero]; // limpia el carrito

    break;
}

case 'cancelar': {
    const numero = senderJid.replace(/[^0-9]/g, '');
    if (carritos[numero]) delete carritos[numero];

    await sock.sendMessage(from, {
        text: '🗑️ Carrito cancelado exitosamente.'
    }, { quoted: msg });

    break;
}
case 'perfilus': {
    const numero = senderJid.replace(/[^0-9]/g, '');

    // Solo tú puedes usar este comando
    if (numero !== '51994729892') {
        await sock.sendMessage(from, {
            text: '❌ Este comando es exclusivo del propietario del bot.'
        }, { quoted: msg });
        break;
    }

    const shopID = args[0]?.toUpperCase();
    if (!shopID) {
        await sock.sendMessage(from, {
            text: '❗ Debes proporcionar un Shop ID. Ejemplo:\n.perfilus BUJ104'
        }, { quoted: msg });
        break;
    }

    const entrada = Object.entries(DB).find(([_, data]) => data.shop?.id?.toUpperCase() === `N° ${shopID}`);

    if (!entrada) {
        await sock.sendMessage(from, {
            text: `❌ No se encontró ningún usuario con Shop ID: ${shopID}`
        }, { quoted: msg });
        break;
    }

    const [userNumber, data] = entrada;
    const { name, rol: userRol, edad, correo, pais, genero, id, telef, code, coin } = data.user;
    const bandera = BANDERAS[pais.toLowerCase()] || '🏳️';

    await sock.sendMessage(from, {
        text:
`📋 *PERFIL DE USUARIO (ADMIN)*

👤 *Nombre:* ${name}
🎭 *Rol:* ${userRol}
📧 *Correo:* ${correo}
🎂 *Edad:* ${edad}
🌍 *País:* ${pais} ${bandera}
⚧️ *Género:* ${genero}
🆔 *ID:* ${id}
🛍️ *Shop ID:* ${data.shop.id}
📞 *Teléfono:* ${telef}
💰 *Coin:* ${coin}
🔐 *Token (binario):*\n${code}`
    }, { quoted: msg });

    break;
}


case 'hidetag':
case 'notificar':
case 'tag':
case 'everyone':
case 'todos': {
    if (!isGroup) {
        await sock.sendMessage(from, { text: '*Este comando solo puede usarse en grupos.*' }, { quoted: msg });
        break;
    }

    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants;
    const isGroupAdmins = participants.find(p => p.id === senderJid)?.admin !== undefined;

    if (!isGroupAdmins) {
        await sock.sendMessage(from, { text: '*Solo los admins pueden usar este comando.*' }, { quoted: msg });
        break;
    }

    const mentions = participants.map(p => p.id);
    const customText = args.join(" ").trim();
    const isReply = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

    if (isReply) {
        const quotedKey = {
            remoteJid: from,
            fromMe: false,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
        };

        try {
            const quotedMsg = await sock.loadMessage(from, quotedKey.id);

            // Si escribió texto, envía ese mensaje primero
            if (customText) {
                await sock.sendMessage(from, {
                    text: `📢 ${customText}`,
                    mentions
                }, { quoted: msg });
            }

            // Reenviar el mensaje citado (de cualquier tipo)
            const forwardContent = await generateForwardMessageContent(
                quotedMsg,
                false
            );

            const content = await generateWAMessageFromContent(from, forwardContent.message, {
                userJid: from,
                quoted: msg,
                mentions
            });

            await sock.relayMessage(from, content.message, { messageId: content.key.id });

        } catch (err) {
            console.error('❌ Error reenviando mensaje citado:', err);
            await sock.sendMessage(from, { text: '❌ No se pudo reenviar el mensaje citado.' }, { quoted: msg });
        }
    } else {
        if (!customText) {
            await sock.sendMessage(from, {
                text: '*Debes escribir un mensaje o responder a uno para notificar.*'
            }, { quoted: msg });
            break;
        }

        await sock.sendMessage(from, {
            text: `📢 ${customText}`,
            mentions
        }, { quoted: msg });
    }

    break;
}
case 'update': {
  if (numero !== '519999999999') { // ← coloca aquí tu número real como creador
    await sock.sendMessage(from, {
      text: '⚠️ Este comando solo puede usarlo el creador.',
      quoted: msg
    });
    break;
  }

  const { execSync } = require('child_process');
  const fs = require('fs');
  const chalk = require('chalk');

  try {
    const pull = execSync('git pull');
    await sock.sendMessage(from, {
      text: `✅ UPDATE DEL SISTEMA:\n\`\`\`\n${pull.toString().trim()}\n\`\`\``,
      quoted: msg
    });

    // Activar auto-recarga del archivo
    const file = require.resolve(__filename);
    fs.watchFile(file, () => {
      fs.unwatchFile(file);
      console.log(chalk.redBright(`🌀 Actualización detectada en ${file}`));
      delete require.cache[file];
      require(file);
    });

  } catch (err) {
    await sock.sendMessage(from, {
      text: `❌ Error al actualizar:\n${err.message}`,
      quoted: msg
    });
  }

  break;
}


case 'setsubasta': {
    const mencionados = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(from, {
            text: '❌ Debes mencionar al usuario usando @nombre en el mensaje.\nEjemplo:\n.setsubasta @usuario por 5000 soles (para comprar una play)'
        });
        break;
    }

    const vendedorJid = mencionados[0];
    const regex = /por\s+(\d+)\s+(\w+)\s+\(([^)]+)\)/i;
    const match = body.match(regex);

    if (!match) {
        await sock.sendMessage(from, {
            text: '❌ Formato incorrecto.\nEjemplo:\n.setsubasta @usuario por 5000 soles (para comprar una play)',
            mentions: mencionados
        });
        break;
    }

    const [_, cantidad, nombreMoneda, descripcion] = match;
    const monedaSimbolo = getCurrencySymbol(nombreMoneda);
    const numeroFormateado = vendedorJid.split('@')[0];
    const timestamp = Date.now();
    const filename = `${timestamp}.json`;
    const filePath = path.join(AUCTION_FOLDER, filename);

    const subasta = {
        vendedor: vendedorJid,
        cantidad,
        moneda: monedaSimbolo,
        descripcion,
        tiempo: timestamp + (5 * 60 * 60 * 1000),
        compradores: [],
        registrados: []
    };

    fs.writeJsonSync(filePath, subasta);
    const groupMetadata = isGroup ? await sock.groupMetadata(from) : {};

    await sock.sendMessage(from, {
        text:
`📣 *SUBASTA INICIADA* 📣
Subasta en: *${groupMetadata.subject.toUpperCase()}*
Vendedor: @${numeroFormateado}
Precio inicial: ${monedaSimbolo}${cantidad}
Descripción: ${descripcion}
Tiempo restante: 5 horas

• Para participar debes registrarte:
*${prefix}sureg nombre*
*${prefix}sureg *

_©️ By Arcanoloch-Group_`,
        mentions: [vendedorJid]
    });

    break;
}
case 'sureg': {
    const nombre = args.join(' ');
    if (!nombre) return sock.sendMessage(from, { text: '❌ Debes ingresar tu nombre.\nEj: .sureg Pedro' });

    const archivos = fs.readdirSync(AUCTION_FOLDER);
    const activa = archivos.find(f => {
        const s = fs.readJsonSync(path.join(AUCTION_FOLDER, f));
        return s && s.tiempo > Date.now();
    });

    if (!activa) return sock.sendMessage(from, { text: '📪 No hay subastas activas.' });

    const ruta = path.join(AUCTION_FOLDER, activa);
    const subasta = fs.readJsonSync(ruta);

    const yaRegistrado = subasta.registrados.find(r => r.id === senderJid);
    if (yaRegistrado) return sock.sendMessage(from, { text: '✅ Ya estás registrado.' });

    subasta.registrados.push({ id: senderJid, nombre });
    fs.writeJsonSync(ruta, subasta);

    await sock.sendMessage(from, { text: `✅ Te registraste como *${nombre}*. Ya puedes ofertar con *.doy cantidad moneda*.` });
    break;
}
case 'doy': {
    const regex = /(\d+)\s+(\w+)/i;
    const match = body.match(regex);
    if (!match) return sock.sendMessage(from, { text: '❌ Formato inválido.\nEj: .doy 5000 soles' });

    const [_, oferta, nombreMoneda] = match;
    const monedaSimbolo = getCurrencySymbol(nombreMoneda);

    const archivos = fs.readdirSync(AUCTION_FOLDER);
    const activa = archivos.find(f => {
        const s = fs.readJsonSync(path.join(AUCTION_FOLDER, f));
        return s && s.tiempo > Date.now();
    });

    if (!activa) return sock.sendMessage(from, { text: '📪 No hay subastas activas.' });

    const ruta = path.join(AUCTION_FOLDER, activa);
    const subasta = fs.readJsonSync(ruta);

    const registrado = subasta.registrados.find(r => r.id === senderJid);
    if (!registrado) return sock.sendMessage(from, { text: '❌ No estás registrado.\nUsa *.sureg tuNombre* antes de ofertar.' });

    subasta.compradores.push({
        id: senderJid,
        oferta,
        moneda: monedaSimbolo,
        nombre: registrado.nombre
    });

    fs.writeJsonSync(ruta, subasta);

    await sock.sendMessage(from, { text: `📝 Oferta aceptada: *${registrado.nombre}* ofrece *${monedaSimbolo}${oferta}*` });
    break;
}
case 'vendido': {
    const nombreComprador = args.join(' ');
    if (!nombreComprador) return sock.sendMessage(from, { text: '❌ Escribe el nombre del comprador.\nEj: .vendido Pedro' });

    const archivos = fs.readdirSync(AUCTION_FOLDER);
    const activa = archivos.find(f => {
        const s = fs.readJsonSync(path.join(AUCTION_FOLDER, f));
        return s && s.tiempo > Date.now();
    });

    if (!activa) return sock.sendMessage(from, { text: '📪 No hay subastas activas.' });

    const ruta = path.join(AUCTION_FOLDER, activa);
    const subasta = fs.readJsonSync(ruta);

    const comprador = subasta.compradores.find(c => c.nombre.toLowerCase() === nombreComprador.toLowerCase());
    if (!comprador) return sock.sendMessage(from, { text: '❌ Comprador no encontrado entre las ofertas.' });

    await sock.sendMessage(from, {
        text:
`✅ *VENTA CONFIRMADA* ✅
Comprador: ${comprador.nombre}
Precio: ${comprador.moneda}${comprador.oferta}
Descripción: ${subasta.descripcion}

Gracias por participar en esta subasta.
Esta subasta ha sido cerrada.

_©️ By Arcanoloch-Group_`
    });

    fs.removeSync(ruta);
    break;
}
case 'cerrarsubasta': {
    const archivos = fs.readdirSync(AUCTION_FOLDER);
    const activa = archivos.find(f => {
        const s = fs.readJsonSync(path.join(AUCTION_FOLDER, f));
        return s && s.tiempo > Date.now();
    });

    if (!activa) return sock.sendMessage(from, { text: '📪 No hay subasta activa que cerrar.' });

    const ruta = path.join(AUCTION_FOLDER, activa);
    fs.removeSync(ruta);

    await sock.sendMessage(from, {
        text:
`🛑 *SUBASTA CANCELADA* 🛑
Se cerró la subasta manualmente sin comprador.

_©️ By Arcanoloch-Group_`
    });

    break;
}


case 'bcgc':
case 'comunicado': {
  const numeroPropietario = '51994729892';
  const isCreator = numero === numeroPropietario;

  const text = args.join(' ');
  if (!isCreator) {
    await sock.sendMessage(from, {
      text: `⚠️ Este comando solo puede usarlo el propietario del bot.`,
      quoted: msg
    });
    break;
  }

  if (!text) {
    await sock.sendMessage(from, {
      text: `✏️ Ingresa el mensaje a difundir.\nEjemplo:\n.bcgc El sistema se actualizará hoy.`,
      quoted: msg
    });
    break;
  }

  const getGroups = await sock.groupFetchAllParticipating();
  const groups = Object.entries(getGroups).map(([_, data]) => data);
  const listaIDs = groups.map(g => g.id);

  const sleep = ms => new Promise(res => setTimeout(res, ms));
  let enviados = 0;

  await sock.sendMessage(from, { text: `📣 Difundiendo a ${listaIDs.length} grupo(s)...` });

  for (const chatId of listaIDs) {
    try {
      await sleep(1500); // Espera para evitar spam
      const mensaje = `📢 *COMUNICADO OFICIAL*\n\n${text}\n\n🤖 Bot: Arcanoloch-Group`;
      await sock.sendMessage(chatId, { text: mensaje }, { quoted: msg });
      enviados++;
    } catch (err) {
      console.error(chalk.red(`❌ Error al enviar a ${chatId}:`), err.message);
    }
  }

  await sock.sendMessage(from, {
    text: `✅ Mensaje enviado a ${enviados} grupo(s).\n⏱️ Tiempo estimado: ${enviados * 1.5} segundos.`
  });

  break;
}
case 'rgmail': {
  const raw = args.join(' ');
  const match = raw.match(/\(([^)]+)\)\s+(\S+@\S+)/);

  if (!match) {
    await sock.sendMessage(from, {
      text: `❌ Formato incorrecto.\nUsa:\n.rgmail (mensaje) destino@gmail.com`
    }, { quoted: msg });
    break;
  }

  const mensaje = match[1];
  const destino = match[2];
  const remitente = 'Arcanolochgroup@gmail.com';
  const claveApp = 'zhmajmejpbamlvvc';

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: remitente,
      pass: claveApp
    }
  });

  const mailOptions = {
    from: remitente,
    to: destino,
    subject: `📢 Mensaje desde Arcanoloch Bot`,
    text: mensaje
  };

  await sock.sendMessage(from, { text: `📨 Enviando correo a ${destino}...` }, { quoted: msg });

  transporter.sendMail(mailOptions, async (error, info) => {
    if (error) {
      console.error('❌ Error al enviar:', error);
      await sock.sendMessage(from, {
        text: `❌ No se pudo enviar el correo.\nMotivo: ${error.message}`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(from, {
        text: `✅ El correo fue enviado correctamente a ${destino}. 📬`
      }, { quoted: msg });
    }
  });

  break;
}

                default:
                    await sock.sendMessage(from, {
                        text: '❌ Comando no reconocido. Usa `.menu` para ver opciones.'
                    });
                    break;
            }

        } catch (err) {
            console.error(chalk.red('\n❌ Error al procesar mensaje:'), err);
        }
    });
};

