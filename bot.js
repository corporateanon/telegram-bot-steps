const Telegraf = require('telegraf');
const Transmission = require('transmission-promise');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

const transmission = new Transmission({
    host: process.env.TRANSMISSION_HOST,
    port: process.env.TRANSMISSION_PORT,
    username: process.env.TRANSMISSION_USERNAME,
    password: process.env.TRANSMISSION_PASSWORD
});

bot.start(ctx => ctx.reply('Welcome'));
bot.help(ctx => ctx.reply('Send me a torrent'));
bot.launch();

bot.on('message', ctx => {
    if (containsTorrentFile(ctx)) {
        return addTorrent(ctx);
    }
});

const containsTorrentFile = ctx => {
    const { message: { document: { mime_type } = {} } = {} } = ctx;
    return mime_type === 'application/x-bittorrent';
};

const addTorrent = async ctx => {
    const {
        message: {
            document: { file_id }
        }
    } = ctx;

    try {
        const fileLink = await ctx.tg.getFileLink(file_id);
        const torrent = await transmission.addUrl(fileLink);
        return ctx.reply(`Added "${torrent.name}"`);
    } catch (e) {
        console.log(`Error: ${e}`);
        return ctx.reply(`Error: ${e}`);
    }
};
