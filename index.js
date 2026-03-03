import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent } from 'discord.js';
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

let db = { sys: [], bypass: [], config: { roleAddLimit1h: 5, roleMaxUsers: 10 } };

if (fs.existsSync(dbPath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        console.error("Erreur de lecture db.json", e);
    }
}

function saveDb() {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

const prefix = '%';

client.on('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot || !message.guild) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const isOwner = message.author.id === ownerId;
    const isSys = isOwner || db.sys.includes(message.author.id);

    if (command === 'sys') {
        if (!isOwner) return message.reply("❌ Seul le propriétaire du bot peut utiliser cette commande.");
        
        if (args.length === 0) {
            const sysList = db.sys.map(id => `<@${id}>`).join('\n') || "Aucun sys.";
            return message.reply(`**Liste des SYS:**\n${sysList}`);
        }

        const targetId = message.mentions.users.first()?.id || args[0].replace(/[<@!>]/g, '');
        if (!targetId || isNaN(Number(targetId))) return message.reply("❌ Veuillez mentionner ou fournir l'ID d'un utilisateur.");

        if (db.sys.includes(targetId)) {
            db.sys = db.sys.filter(id => id !== targetId);
            saveDb();
            return message.reply(`✅ <@${targetId}> a été retiré des sys.`);
        } else {
            db.sys.push(targetId);
            saveDb();
            return message.reply(`✅ <@${targetId}> a été ajouté aux sys.`);
        }
    }

    if (command === 'bypass') {
        if (!isSys) return message.reply("❌ Seul un SYS peut utiliser cette commande.");

        if (args.length === 0) {
            const bypassList = db.bypass.map(id => `<@${id}>`).join('\n') || "Aucun bypass.";
            return message.reply(`**Liste des personnes BYPASS:**\n${bypassList}`);
        }

        const targetId = message.mentions.users.first()?.id || args[0].replace(/[<@!>]/g, '');
        if (!targetId || isNaN(Number(targetId))) return message.reply("❌ Veuillez mentionner ou fournir l'ID d'un utilisateur.");

        if (db.bypass.includes(targetId)) {
            db.bypass = db.bypass.filter(id => id !== targetId);
            saveDb();
            return message.reply(`✅ <@${targetId}> a été retiré de la liste bypass.`);
        } else {
            db.bypass.push(targetId);
            saveDb();
            return message.reply(`✅ <@${targetId}> a été ajouté à la liste bypass.`);
        }
    }

    if (command === 'config') {
        if (!isSys) return message.reply("❌ Seul un SYS peut utiliser cette commande.");

        const embed = new EmbedBuilder()
            .setTitle("⚙️ Panneau de Configuration")
            .setDescription(`**Limite de rôles ajoutés par un membre en 1h:** ${db.config.roleAddLimit1h}\n**Limite de personnes maximum sur un même rôle:** ${db.config.roleMaxUsers}`)
            .setColor(0x2f3136);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_edit_config')
                .setLabel('Modifier la Configuration')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️')
        );

        return message.reply({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && interaction.customId === 'btn_edit_config') {
        const isOwner = interaction.user.id === ownerId;
        const isSys = isOwner || db.sys.includes(interaction.user.id);
        if (!isSys) return interaction.reply({ content: "❌ Vous n'avez pas la permission de faire cela.", ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId('modal_config')
            .setTitle('Modifier la Configuration');

        const limitRole1h = new TextInputBuilder()
            .setCustomId('input_limit_1h')
            .setLabel("Limite d'ajouts en 1h")
            .setStyle(TextInputStyle.Short)
            .setValue(db.config.roleAddLimit1h.toString())
            .setRequired(true);

        const limitRoleMax = new TextInputBuilder()
            .setCustomId('input_limit_max')
            .setLabel("Limite de pers. par rôle")
            .setStyle(TextInputStyle.Short)
            .setValue(db.config.roleMaxUsers.toString())
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(limitRole1h),
            new ActionRowBuilder().addComponents(limitRoleMax)
        );

        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_config') {
        const limit1h = parseInt(interaction.fields.getTextInputValue('input_limit_1h'));
        const limitMax = parseInt(interaction.fields.getTextInputValue('input_limit_max'));

        if (isNaN(limit1h) || isNaN(limitMax)) {
            return interaction.reply({ content: "❌ Les valeurs doivent être des nombres valides.", ephemeral: true });
        }

        db.config.roleAddLimit1h = limit1h;
        db.config.roleMaxUsers = limitMax;
        saveDb();

        const embed = new EmbedBuilder()
            .setTitle("⚙️ Panneau de Configuration")
            .setDescription(`**Limite de rôles ajoutés par un membre en 1h:** ${db.config.roleAddLimit1h}\n**Limite de personnes maximum sur un même rôle:** ${db.config.roleMaxUsers}`)
            .setColor(0x00ff00);

        await interaction.update({ embeds: [embed], components: interaction.message.components });
        await interaction.followUp({ content: "✅ Configuration mise à jour avec succès !", ephemeral: true });
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

    // Attendre pour s'assurer que les logs d'audit sont disponibles
    await new Promise(res => setTimeout(res, 2000));

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
    if (executorId === client.user.id) return; // Ignorer les actions du bot lui-même

    const isSys = executorId === ownerId || db.sys.includes(executorId);
    const isBypass = isSys || db.bypass.includes(executorId) || db.bypass.includes(newMember.id);

    if (isBypass) return; // Si la personne qui ajoute le rôle, ou qui le reçoit, est bypass ou sys/owner, on ne fait rien.

    let shouldRevert = false;
    let reason = "";

    // Vérification de la limite de personnes par rôle
    for (const role of addedRoles.values()) {
        if (role.members.size > db.config.roleMaxUsers) {
            shouldRevert = true;
            reason = `Le rôle ${role.name} a atteint la limite de ${db.config.roleMaxUsers} membres.`;
            break;
        }
    }

    // Vérification de la limite d'ajouts par heure pour la personne
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (!roleAdditionsTracker[executorId]) {
        roleAdditionsTracker[executorId] = [];
    }

    // Nettoyer les ajouts vieux de plus d'une heure
    roleAdditionsTracker[executorId] = roleAdditionsTracker[executorId].filter(timestamp => now - timestamp < oneHour);
    roleAdditionsTracker[executorId].push(now);

    if (roleAdditionsTracker[executorId].length > db.config.roleAddLimit1h) {
        shouldRevert = true;
        reason = `L'utilisateur a dépassé la limite d'ajout de ${db.config.roleAddLimit1h} rôles par heure.`;
    }

    if (shouldRevert) {
        try {
            await newMember.roles.remove(addedRoles, `Anti-nuke: ${reason}`);
            console.log(`[Anti-nuke] Rôle retiré à ${newMember.user.tag} ajouté par ${logEntry.executor.tag}. Raison: ${reason}`);
        } catch (e) {
            console.error("Impossible de retirer le rôle:", e);
        }
    }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Erreur de connexion au bot. Avez-vous configuré la variable DISCORD_TOKEN ?", err);
});
