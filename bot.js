const Telegraf = require('telegraf');
const Transmission = require('transmission-promise');
const sleep = require('sleep-promise');

require('dotenv').config();

const CHECK_POLLING_INTERVAL = 5000;

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

const transmission = new Transmission({
    host: process.env.TRANSMISSION_HOST,
    port: process.env.TRANSMISSION_PORT,
    username: process.env.TRANSMISSION_USERNAME,
    password: process.env.TRANSMISSION_PASSWORD
});

bot.on('message', ctx => {
    if (containsTorrentFile(ctx)) {
        return addTorrent(ctx);
    }
});

const waitList = {};

const waitListRemove = torrentId => {
    delete waitList[torrentId];
};

const waitListAdd = (torrentId, chatId) => {
    waitList[torrentId] = chatId;
};

const waitListGetAll = () => {
    return waitList;
};

const checkStatuses = async () => {
    const chatIdByTorrentId = waitListGetAll();
    const waitListLength = Object.keys(chatIdByTorrentId).length;
    if (waitListLength === 0) {
        return;
    }

    console.log(`Checking ${waitListLength} torrents`);

    //Ключи объекта — это ID торрентов. Их надо привести к целым числам, инача Transmission API не поймёт
    const torrentIds = Object.keys(chatIdByTorrentId).map(i => parseInt(i, 10));
    const { torrents } = await transmission.get(torrentIds);

    //Соберём мусор. По тем или иным причинам торренты могут быть уже удалены в Transmission, но присутствовать в нашем списке ожидания
    const foundTorrentIds = torrents.map(t => parseInt(t.id, 10));
    for (const waitingTorrentId of Object.keys(chatIdByTorrentId)) {
        if (!foundTorrentIds.includes(parseInt(waitingTorrentId, 10))) {
            console.log(
                'Torrent not found in transmission %s',
                waitingTorrentId
            );
            waitListRemove(waitingTorrentId);
        }
    }

    //Пройдёмся по всем торрентам и проверим статус каждого из них.
    //Если он больше 4 (то есть, торрент завершён), то мы уведомляем об этом пользователя, отправляя сообщения на chatId. Также завершённые торренты удаляются из списка ожидания.
    for (const torrent of torrents) {
        if (torrent.status > 4) {
            console.log('Torrent finished: ', torrent.name);
            const chatId = parseInt(chatIdByTorrentId[torrent.id], 10);
            waitListRemove(torrent.id);
            if (chatId) {
                await bot.telegram.sendMessage(
                    chatId,
                    `✅ Torrent finished "${torrent.name}"`
                );
            }
        }
    }
};

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
        waitListAdd(torrent.id, ctx.chat.id);
        return ctx.reply(`Added "${torrent.name}"`);
    } catch (e) {
        console.log(`Error: ${e}`);
        return ctx.reply(`Error: ${e}`);
    }
};

const startCheckStatusPolling = async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await sleep(CHECK_POLLING_INTERVAL);
        try {
            await checkStatuses();
        } catch (error) {
            console.log(
                'checkStatuses failed with error',
                error.stack || error.message
            );
        }
    }
};

bot.start(ctx => ctx.reply('Welcome'));
bot.help(ctx => ctx.reply('Send me a torrent'));
bot.launch();
startCheckStatusPolling();