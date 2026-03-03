import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(process.env.PORT || 5000, '0.0.0.0', () => console.log('Web server started'));
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType, AuditLogEvent } from 'discord.js';
import fs from 'fs';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

const ownerId = '1363398588343779500';
const dbPath = './db.json';
const grayColor = 0x2f3136;

let db = { 
    sys: [], 
    bypass: [], 
    config: { roleAddLimit1h: 5 }, 
    roleLimits: {},
    logsChannel: null
};

if (fs.existsSync(dbPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        db = { ...db, ...data };
        if (!db.roleLimits) db.roleLimits = {};
    } catch (e) {
        console.error("Erreur de lecture db.json", e);
    }
}

function saveDb() {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function createEmbed(text) {
    return new EmbedBuilder().setDescription(text).setColor(grayColor);
}

async function sendLog(guild, text) {
    if (!db.logsChannel) return;
    const channel = guild.channels.cache.get(db.logsChannel);
    if (channel) {
        channel.send({ embeds: [createEmbed(text)] }).catch(() => {});
    }
}

const prefix = '%';

client.on('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}!`);
    client.user.setActivity('limit', { 
        type: ActivityType.Streaming, 
        url: 'https://www.twitch.tv/discord' 
    });
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot || !message.guild) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const isOwner = message.author.id === ownerId;
    const isSys = isOwner || db.sys.includes(message.author.id);

    if (command === 'help') {
        const helpDesc = `**📖 Liste des Commandes :**\n
\`%help\` - Affiche ce message d'aide
\`%sys [@user/ID]\` - Ajoute ou retire un utilisateur de la liste sys (Propriétaire uniquement)
\`%sys\` - Affiche la liste des sys
\`%bypass [@user/ID]\` - Ajoute ou retire une personne de la liste bypass (Sys)
\`%bypass\` - Affiche la liste des personnes bypass
\`%config global <nombre>\` - Configure la limite d'ajout de rôles par heure par personne (Sys)
\`%config [@role/ID] <nombre>\` - Configure le nombre maximum de personnes pour un rôle précis (Sys)
\`%config [@role/ID]\` - Retire la limite configurée pour un rôle précis (Sys)
\`%limit\` - Affiche la limite configurée pour chaque rôle
\`%logs [#salon/ID]\` - Définit le salon pour les logs d'anti-nuke (Sys)`;
        return message.reply({ embeds: [createEmbed(helpDesc)] });
    }

    if (command === 'sys') {
        if (!isOwner) return message.reply({ embeds: [createEmbed("❌ Seul le propriétaire du bot peut utiliser cette commande.")] });
        
        if (args.length === 0) {
            const sysList = db.sys.map(id => `<@${id}>`).join('\n') || "Aucun sys configuré.";
            return message.reply({ embeds: [createEmbed(`**Liste des SYS:**\n${sysList}`)] });
        }

        const targetId = message.mentions.users.first()?.id || args[0].replace(/[<@!>]/g, '');
        if (!targetId || isNaN(Number(targetId))) return message.reply({ embeds: [createEmbed("❌ Veuillez mentionner ou fournir l'ID d'un utilisateur.")] });

        if (db.sys.includes(targetId)) {
            db.sys = db.sys.filter(id => id !== targetId);
            saveDb();
            return message.reply({ embeds: [createEmbed(`✅ <@${targetId}> a été retiré des sys.`)] });
        } else {
            db.sys.push(targetId);
            saveDb();
            return message.reply({ embeds: [createEmbed(`✅ <@${targetId}> a été ajouté aux sys.`)] });
        }
    }

    if (command === 'bypass') {
        if (!isSys) return message.reply({ embeds: [createEmbed("❌ Seul un SYS peut utiliser cette commande.")] });

        if (args.length === 0) {
            const bypassList = db.bypass.map(id => `<@${id}>`).join('\n') || "Aucun bypass configuré.";
            return message.reply({ embeds: [createEmbed(`**Liste des personnes BYPASS:**\n${bypassList}`)] });
        }

        const targetId = message.mentions.users.first()?.id || args[0].replace(/[<@!>]/g, '');
        if (!targetId || isNaN(Number(targetId))) return message.reply({ embeds: [createEmbed("❌ Veuillez mentionner ou fournir l'ID d'un utilisateur.")] });

        if (db.bypass.includes(targetId)) {
            db.bypass = db.bypass.filter(id => id !== targetId);
            saveDb();
            return message.reply({ embeds: [createEmbed(`✅ <@${targetId}> a été retiré de la liste bypass.`)] });
        } else {
            db.bypass.push(targetId);
            saveDb();
            return message.reply({ embeds: [createEmbed(`✅ <@${targetId}> a été ajouté à la liste bypass.`)] });
        }
    }

    if (command === 'config') {
        if (!isSys) return message.reply({ embeds: [createEmbed("❌ Seul un SYS peut utiliser cette commande.")] });

        if (args.length === 0) {
            return message.reply({ embeds: [createEmbed(`**Configuration actuelle:**\nLimite d'ajouts de rôles par heure: **${db.config.roleAddLimit1h}**\n\nUtilisez \`%config global <nombre>\` ou \`%config <@role> <nombre>\` pour modifier.`)] });
        }

        if (args[0].toLowerCase() === 'global') {
            const limit = parseInt(args[1]);
            if (isNaN(limit) || limit < 0) return message.reply({ embeds: [createEmbed("❌ Veuillez spécifier un nombre valide.")] });
            db.config.roleAddLimit1h = limit;
            saveDb();
            return message.reply({ embeds: [createEmbed(`✅ Limite globale d'ajouts de rôles fixée à **${limit}** par heure.`)] });
        } else {
            const roleId = message.mentions.roles.first()?.id || args[0].replace(/[<@&>]/g, '');
            const role = message.guild.roles.cache.get(roleId);
            
            if (!role) return message.reply({ embeds: [createEmbed("❌ Rôle introuvable. Veuillez mentionner un rôle valide ou donner son ID.")] });
            
            const limit = parseInt(args[1]);
            if (isNaN(limit) || limit < 0) {
                // Supprimer la limite
                delete db.roleLimits[roleId];
                saveDb();
                return message.reply({ embeds: [createEmbed(`✅ Limite supprimée pour le rôle <@&${roleId}>.`)] });
            }

            db.roleLimits[roleId] = limit;
            saveDb();
            return message.reply({ embeds: [createEmbed(`✅ Limite pour le rôle <@&${roleId}> fixée à **${limit}** membres maximum.`)] });
        }
    }

    if (command === 'limit') {
        if (Object.keys(db.roleLimits).length === 0) {
            return message.reply({ embeds: [createEmbed("Aucune limite de rôle n'est configurée actuellement.")] });
        }
        let desc = "**Limites configurées par rôle:**\n\n";
        for (const [rId, lim] of Object.entries(db.roleLimits)) {
            desc += `<@&${rId}> : **${lim}** personnes max\n`;
        }
        return message.reply({ embeds: [createEmbed(desc)] });
    }

    if (command === 'logs') {
        if (!isSys) return message.reply({ embeds: [createEmbed("❌ Seul un SYS peut utiliser cette commande.")] });

        const channelId = message.mentions.channels.first()?.id || args[0]?.replace(/[<#!>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);

        if (!channel) return message.reply({ embeds: [createEmbed("❌ Salon introuvable. Veuillez mentionner un salon valide.")] });

        db.logsChannel = channel.id;
        saveDb();
        return message.reply({ embeds: [createEmbed(`✅ Le salon des logs d'anti-nuke a été défini sur <#${channel.id}>.`)] });
    }
});

// Format: { userId: [ timestamp1, timestamp2, ... ] }
const roleAdditionsTracker = {};

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    if (oldRoles.size >= newRoles.size) return;

    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    if (addedRoles.size === 0) return;

    await new Promise(res => setTimeout(res, 2000)); // Attendre l'audit log

    let auditLogs;
    try {
        auditLogs = await newMember.guild.fetchAuditLogs({ limit: 10, type: AuditLogEvent.MemberRoleUpdate });
    } catch (e) {
        console.error("Impossible de récupérer les logs d'audit:", e);
        return;
    }

    const logEntry = auditLogs.entries.find(entry => 
        entry.target.id === newMember.id && 
        entry.createdTimestamp > Date.now() - 10000
    );

    if (!logEntry) return;

    const executorId = logEntry.executor.id;
    if (executorId === client.user.id) return;

    const isSys = executorId === ownerId || db.sys.includes(executorId);
    const isBypass = isSys || db.bypass.includes(executorId) || db.bypass.includes(newMember.id);

    if (isBypass) return;

    let shouldRevert = false;
    let reason = "";

    // Vérification de la limite de personnes par rôle spécifique
    for (const role of addedRoles.values()) {
        if (db.roleLimits[role.id] !== undefined) {
            const limit = db.roleLimits[role.id];
            if (role.members.size > limit) {
                shouldRevert = true;
                reason = `Le rôle <@&${role.id}> a atteint sa limite stricte de ${limit} membres.`;
                break;
            }
        }
    }

    // Vérification de la limite d'ajouts par heure pour l'exécuteur
    if (!shouldRevert) {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (!roleAdditionsTracker[executorId]) {
            roleAdditionsTracker[executorId] = [];
        }

        roleAdditionsTracker[executorId] = roleAdditionsTracker[executorId].filter(timestamp => now - timestamp < oneHour);
        
        // Ajouter un point par rôle ajouté
        for (let i = 0; i < addedRoles.size; i++) {
            roleAdditionsTracker[executorId].push(now);
        }

        if (roleAdditionsTracker[executorId].length > db.config.roleAddLimit1h) {
            shouldRevert = true;
            reason = `L'utilisateur a dépassé la limite d'ajout de ${db.config.roleAddLimit1h} rôles par heure.`;
        }
    }

    if (shouldRevert) {
        try {
            await newMember.roles.remove(addedRoles, `Anti-nuke: Limite dépassée`);
            
            const rolesMentions = addedRoles.map(r => `<@&${r.id}>`).join(', ');
            sendLog(newMember.guild, `🚨 **Action Anti-Nuke** 🚨\n\n**Cible:** <@${newMember.id}>\n**Exécuteur:** <@${executorId}>\n**Rôles retirés:** ${rolesMentions}\n\n**Raison:** ${reason}`);
            
            console.log(`[Anti-nuke] Rôle(s) retiré(s) à ${newMember.user.tag}. Raison: ${reason}`);
        } catch (e) {
            console.error("Impossible de retirer le rôle:", e);
        }
    }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Erreur de connexion au bot. Avez-vous configuré la variable DISCORD_TOKEN ?", err);
});
