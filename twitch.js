require('dotenv').config();

const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const fs = require('fs');
const { getCurrentVideo } = require('./playlist');

const clientId = process.env.CLIENTID;
const clientSecret = process.env.CLIENTSECRET;
const channelUserId = String(process.env.CHANNELID);


let twitchApi = null;

if (channelUserId && channelUserId !== 'undefined') {
    
    const channelTokenData = JSON.parse(fs.readFileSync(`./token/tokens.${channelUserId}.json`, 'UTF-8'));
    const authProvider = new RefreshingAuthProvider(
        {
            clientId,
            clientSecret,
            onRefresh: async (userId, newTokenData) => {
                try {
                    fs.writeFileSync(`./token/tokens.${userId}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8')
                } catch(ex) {
                    console.error(ex);
                }
                
            }
        }
    );
    authProvider.addUser(channelUserId, channelTokenData, []);
    
    twitchApi = new ApiClient({ authProvider });
}

function changeTwitchTitle(videoDetails) {
    const title = '[24/7 VOD] ' + videoDetails.title;
    twitchApi.channels.updateChannelInfo(channelUserId, {title});
    console.log('Change Titel: ' + title);
    return title;
}

function autoChangeTitle(playlistInfo) {
    if (!twitchApi) {
        return;
    }
    let currentTitle = '';
    let interval = 10000;
    let time = 0;
    setInterval(() => {
        time += interval;
        const videoDetails = getCurrentVideo(playlistInfo, time);
        if (videoDetails.title != currentTitle) {
            currentTitle = videoDetails.title;
            changeTwitchTitle(videoDetails);
        }
    }, interval);
}

module.exports = {
    autoChangeTitle,
    changeTwitchTitle
}
