require('dotenv').config();

const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const fs = require('fs');
const { getVideoDetails } = require('./yt');

const clientId = process.env.CLIENTID;
const clientSecret = process.env.CLIENTSECRET;
const botUserId = String(process.env.USERID);
const channelUserId = String(process.env.CHANNELID);
const botTokenData = JSON.parse(fs.readFileSync(`./token/tokens.${botUserId}.json`, 'UTF-8'));
const channelTokenData = JSON.parse(fs.readFileSync(`./token/tokens.${channelUserId}.json`, 'UTF-8'));

const authProvider = new RefreshingAuthProvider(
	{
		clientId,
		clientSecret,
		onRefresh: async (userId, newTokenData) => {
			try {
				fs.writeFileSync(`./token/tokens.${userId}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8')
			} catch(ex) {
				console.error(filename, ex);
			}
			
		}
	}
);

authProvider.addUser(botUserId, botTokenData, [
    "chat"
]);

authProvider.addUser(channelUserId, channelTokenData, []);

const twitchApi = new ApiClient({ authProvider });

async function changeTwitchTitle(youtubeURL, outDir) {
    const youtubeDetails = await getVideoDetails(youtubeURL, outDir);
    const title = '[24/7 VOD] ' + data.title;
    twitchApi.channels.updateChannelInfo(channelUserId, {title});
    console.log('Change Titel: ' + title);
}

module.exports = {
    changeTwitchTitle
}
