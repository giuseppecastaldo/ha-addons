const {
    proto,
    initAuthCreds,
    BufferJSON
} = require("@adiwajshing/baileys");
const fs = require('fs');

const KEY_MAP = {
    'pre-key': 'preKeys',
    'session': 'sessions',
    'sender-key': 'senderKeys',
    'app-state-sync-key': 'appStateSyncKeys',
    'app-state-sync-version': 'appStateVersions',
    'sender-key-memory': 'senderKeyMemory'
};

async function readFileAsync(filename) {
    try {
        return await fs.promises.readFile(filename, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
    }
}

async function writeToFileAsync(filename, text) {
    await fs.promises.writeFile(filename, text, 'utf8');
}

const useFileAuthState = async (path) => {
   const saved_data = await readFileAsync(path)

    let creds = saved_data != null ? JSON.parse(saved_data, BufferJSON.reviver).creds : initAuthCreds();
    let keys = saved_data != null ? JSON.parse(saved_data, BufferJSON.reviver).keys : {};

    const saveState = () => {
        writeToFileAsync(path, JSON.stringify({ creds, keys }, BufferJSON.replacer, 2));
    };

    return {
        state: {
            creds,
            keys: {
                get: (type, ids) => {
                    const key = KEY_MAP[type];
                    return ids.reduce((dict, id) => {
                        var _a;
                        let value = (_a = keys[key]) === null || _a === void 0 ? void 0 : _a[id];
                        if (value) {
                            if (type === 'app-state-sync-key') {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            dict[id] = value;
                        }
                        return dict;
                    }, {});
                },
                set: (data) => {
                    for (const _key in data) {
                        const key = KEY_MAP[_key];
                        keys[key] = keys[key] || {};
                        Object.assign(keys[key], data[_key]);
                    }
                    saveState();
                }
            }
        },
        saveState
    };
};

module.exports = useFileAuthState