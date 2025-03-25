const { Client, GatewayIntentBits, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { GPTFREE } = require('gptfree-plugin');
//const mysql = require('mysql2/promise');
require('dotenv').config();

class IABot {
  constructor() {
    this.token = process.env.TOKEN;
    this.clientId = process.env.CLIENT_ID;
    this.guildId = process.env.GUILD_ID;
    this.firstRole = process.env.EXPLORE_ROLE;
    this.secondRole = process.env.CONSTRUCTOR_ROLE;
    this.thirdRole = process.env.INVESTIGADOR_ROLE;
    this.channelId = process.env.CHANNEL_ID;
    this.g4f = new GPTFREE();
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites

      ]
    });

    this.requestQueue = new Map();
    this.setupEventListeners();
    this.setupSlashCommands();
  }

  setupEventListeners() {
    const inviteRoleMap = new Map();
    this.client.invites = new Map();


    this.client.on('ready', async () => {
        console.log(`Logged in as ${this.client.user.tag}`);
        // Carga inicial de invitaciones
        for (const guild of this.client.guilds.cache.values()) {
            const guildInvites = await guild.invites.fetch();
            this.client.invites.set(guild.id, new Map(guildInvites.map(invite => [invite.code, invite.uses])));
        }

        try {
          const guild = await this.client.guilds.fetch(this.guildId);
          const role = await guild.roles.fetch(this.secondRole);
      
          if (!role) {
            console.log("❌ No se encontró el rol.");
            return;
          }
      
          const members = await guild.members.fetch(); // Obtiene todos los miembros
      
          members.forEach(async (member) => {
            // Verifica si el miembro solo tiene el rol @everyone
            if (member.roles.cache.size === 1) {
              try {
                await member.roles.add(role);
                console.log(`✅ Se asignó el rol a ${member.user.tag}`);
              } catch (error) {
                console.error(`❌ Error asignando rol a ${member.user.tag}:`, error);
              }
            }
          });
        } catch (error) {
          console.error("❌ Error obteniendo el servidor o rol:", error);
        }
    });

    this.client.on('guildMemberAdd', async (member) => {
      console.log(`🔹 Nuevo usuario detectado: ${member.user.tag}`);

      try {
          if (!member.guild.members.me.permissions.has(['ManageRoles', 'CreateInstantInvite'])) {
              console.log('El bot no tiene los permisos necesarios');
              return;
          }

          // Obtener nuevas invitaciones
          const newInvites = await member.guild.invites.fetch();
          // Obtener invitaciones antiguas
          const oldInvites = this.client.invites.get(member.guild.id);
          // Actualizar el cache de invitaciones
          this.client.invites.set(member.guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));

          // Encontrar la invitación usada
          const usedInvite = newInvites.find(invite => {
              const oldUses = oldInvites.get(invite.code) || 0;
              return invite.uses > oldUses;
          });

          if (!usedInvite) {
              console.log('No se pudo determinar la invitación usada');
              return;
          }

          // Obtener el rol asociado a la invitación
          const roleId = inviteRoleMap.get(usedInvite.code);
          if (!roleId) {
              console.log(`No hay rol asociado a la invitación: ${usedInvite.code}`);
              return;
          }

          const roleToAssign = member.guild.roles.cache.get(roleId);
          if (!roleToAssign) {
              console.log(`❌ No se encontró el rol con ID: ${roleId}`);
              return;
          }

          await member.roles.add(roleToAssign);
          console.log(`✅ Rol ${roleToAssign.name} asignado exitosamente a ${member.user.tag}`);

      } catch (error) {
          console.error('❌ Error al asignar el rol:', error);
      }
  });


// Comando para generar invitaciones
this.client.on('messageCreate', async (message) => {
  if (message.content === '!createinvites') {
      if (!message.member.permissions.has('CreateInstantInvite')) {
          message.reply('No tienes permisos para crear invitaciones');
          return;
      }

      try {
        const invite1 = await message.channel.createInvite({
          maxAge: 0,
          maxUses: 0,
          unique: true,
          reason: 'Invitación para rol Explorador'
      });
          const invite2 = await message.channel.createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: true,
            reason: 'Invitación para rol Constructor'
        });
        const invite3 = await message.channel.createInvite({
          maxAge: 0,
          maxUses: 0,
          unique: true,
          reason: 'Invitación para rol Investigador'
      });

          // Guardar la relación invitación-rol
          inviteRoleMap.set(invite1.code, this.firstRole);
          inviteRoleMap.set(invite2.code, this.secondRole);
          inviteRoleMap.set(invite3.code, this.thirdRole);

          message.reply(`
                ✅ Invitaciones creadas exitosamente:

                Primer Rol <@&${this.firstRole}>:
                ${invite1.url}

                Segundo Rol <@&${this.secondRole}>:
                ${invite2.url}

                Tercer Rol <@&${this.thirdRole}>:
                ${invite3.url}
            `);

      } catch (error) {
          console.error('Error al crear la invitación:', error);
          message.reply('❌ Hubo un error al crear la invitación');
      }
  }
});


    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;

      if (interaction.commandName === 'assist') {
        const prompt = interaction.options.getString('prompt');
        const query = interaction.options.getString('query');
        await this.handleAsistanceRequest(interaction, prompt, query);
      }
      if (interaction.commandName === 'ai') {
        const query = interaction.options.getString('query');
        await this.handleAIRequest(interaction, query);
      }
    });
  }

  async setupSlashCommands() {
    const rest = new REST({ version: '9' }).setToken(this.token);

    const commands = [
      {
        name: 'ai',
        description: 'Interactúa con la IA',
        options: [
          {
            name: 'query',
            description: 'Consulta para la IA',
            type: 3,
            required: true
          }
        ]
      },
      {
        name: 'assist',
        description: 'Entrena un agente y hazle preguntas',
        options: [
          {
            name: 'prompt',
            description: 'Entra un prompt para generar texto',
            type: 3,
            required: true
          },
          {
            name: 'query',
            description: 'Consulta para la IA',
            type: 3,
            required: true
          }
        ]
      }
    ];

    try {
      console.log('Registrando comandos de barra');
      await rest.put(Routes.applicationGuildCommands(this.clientId, this.guildId), {
        body: commands
      });
      console.log('Comandos de barra registrados exitosamente');
    } catch (error) {
      console.error('Error al registrar comandos:', error);
    }
  }

  async handleAIRequest(interaction, query) {
    const userId = interaction.user.id;

    try {
      // Verificar cooldown
      const timeRemaining = await this.getTimeRemaining(userId);
      if (timeRemaining > 0) {
        await interaction.reply({
          content: `${interaction.user}, debes esperar ${timeRemaining} segundos antes de enviar otro comando.`,
          ephemeral: true
        });
        return;
      }

      // Verificar cola
      if (this.requestQueue.has(userId)) {
        await interaction.reply({
          content: `${interaction.user}, ya tienes una solicitud en proceso.`,
          ephemeral: true
        });
        return;
      }

      this.requestQueue.set(userId, true);

      await interaction.deferReply();

      const messages = [
        { role: "user", content: query }
      ];

      const options = {
        model: "gpt-4o"
      };

      console.log('data que viene de dc', messages);

      const textResponse = await Promise.race([
        this.g4f.chatCompletions(messages, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout de texto')), 30000)
        )
      ]);

      // Actualizar último tiempo de solicitud
      await this.pool.execute(this.insertUserRequestQuery, [userId, Date.now()]);

      await this.sendSplitMessage(interaction, textResponse);
    } catch (error) {
      console.error('Error completo:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(`${interaction.user}, ocurrió un error: ${error.message}`);
        } else {
          await interaction.reply(`${interaction.user}, ocurrió un error: ${error.message}`);
        }
      } catch (replyError) {
        console.error('Error al enviar mensaje de error:', replyError);
        try {
          await interaction.followUp(`${interaction.user}, ocurrió un error al procesar tu solicitud.`);
        } catch {
          console.error('Fallo total al enviar mensaje de error');
        }
      }
    } finally {
      this.requestQueue.delete(userId);
    }
  }

  async handleAsistanceRequest(interaction, prompt, query) {
    const userId = interaction.user.id;

    try {
      // Verificar cooldown
      const timeRemaining = await this.getTimeRemaining(userId);
      if (timeRemaining > 0) {
        await interaction.reply({
          content: `${interaction.user}, debes esperar ${timeRemaining} segundos antes de enviar otro comando.`,
          ephemeral: true
        });
        return;
      }

      // Verificar cola
      if (this.requestQueue.has(userId)) {
        await interaction.reply({
          content: `${interaction.user}, ya tienes una solicitud en proceso.`,
          ephemeral: true
        });
        return;
      }

      this.requestQueue.set(userId, true);

      await interaction.deferReply();

      const messages = [
        { role: "assistant", content: prompt },
        { role: "user", content: query }
      ];

      const options = {
        model: "gpt-4o"
      };

      console.log('data que viene de dc', messages);

      const textResponse = await Promise.race([
        this.g4f.chatCompletions(messages, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout de texto')), 30000)
        )
      ]);

      // Actualizar último tiempo de solicitud
      await this.pool.execute(this.insertUserRequestQuery, [userId, Date.now()]);

      await this.sendSplitMessage(interaction, textResponse);
    } catch (error) {
      console.error('Error completo:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(`${interaction.user}, ocurrió un error: ${error.message}`);
        } else {
          await interaction.reply(`${interaction.user}, ocurrió un error: ${error.message}`);
        }
      } catch (replyError) {
        console.error('Error al enviar mensaje de error:', replyError);
        try {
          await interaction.followUp(`${interaction.user}, ocurrió un error al procesar tu solicitud.`);
        } catch {
          console.error('Fallo total al enviar mensaje de error');
        }
      }
    } finally {
      this.requestQueue.delete(userId);
    }
  }

  async sendSplitMessage(interaction, content) {
    if (content.length > 6000) {
      content = content.substring(0, 6000) + '\n\n[Mensaje truncado por límite de longitud]';
    }

    const maxLength = 1900;
    const chunks = [];

    while (content.length > 0) {
      let chunk;
      if (content.length <= maxLength) {
        chunk = content;
        content = '';
      } else {
        let splitIndex = content.lastIndexOf('.', maxLength);
        if (splitIndex === -1) {
          splitIndex = content.lastIndexOf(' ', maxLength);
        }

        if (splitIndex === -1 || splitIndex < maxLength / 2) {
          splitIndex = maxLength;
        }

        chunk = content.slice(0, splitIndex);
        content = content.slice(splitIndex).trim();
      }

      chunks.push(chunk);
    }

    for (const chunk of chunks) {
      await interaction.followUp(chunk);
    }
  }

  async getTimeRemaining(userId) {
    const cooldownDuration = 120; // 2 minutos de cooldown

    const [rows] = await this.pool.execute(this.getUserRequestQuery, [userId]);
    const lastRequest = rows[0];

    if (!lastRequest) return 0;

    const timeSinceLastRequest = (Date.now() - lastRequest.last_request_time) / 1000;
    return Math.max(0, cooldownDuration - Math.floor(timeSinceLastRequest));
  }

  async start() {
    await this.client.login(this.token);
  }
}

module.exports = IABot;