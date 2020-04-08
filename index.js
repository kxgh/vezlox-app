/**
 * @author kxgh
 */
'use strict';
const {exec} = require("child_process");
const crypto = require('crypto');
const WS = require('ws');
const fs = require('fs');
const ezlox = require('./k-ezlox')();
const path = require('path');
const shr = require('@kxghnpm/kx-shredder-sync').createShredder();
const pin = require('./pin');

let fl;
let begun = false;
let PIN,
    WSS,
    PORT,
    SHRED_UNLINKS,
    START_DIR,
    BLACK_LIST;


function begin() {
    if (begun)
        return;
    begun = true;
    PIN = pin.genInjectGet();
    loadConfig();
    WSS = new WS.Server({port: PORT}, function () {
        console.info('listening on port', PORT);
    });
    WSS.on('connection', (ws, req) => {
        ws.on('message', msg => {
            onMsg(JSON.parse(msg), ws);
        });
        if (fl.isDirectory(START_DIR))
            sendMsg(browse(START_DIR), ws);
        else sendMsg(browse(process.cwd()), ws);
    });
}

function close() {
    console.info('Closing WSS...')
    WSS.close();
}

function cleanPath(p) {
    return path.normalize(path.resolve(p.trim()))
}

function sendMsg(msg, ws) {
    ws.send(JSON.stringify(msg));
}

async function onMsg(msg, ws) {
    if (msg.pin != PIN) {
        console.warn('Received message with incorrect pin, shutting down...');
        close();
        return;
    }
    try {
        console.debug('Got msg:');
        console.debug(msg);
        if (msg.type === 'browse') {
            const resp = browse(msg.target);
            resp.sid = msg.sid;
            sendMsg(resp, ws);
        }
        if (msg.type === 'run') {
            run(msg.target, ws);
        }
        if (msg.type === 'explore') {
            explore(msg.target, ws);
        }
        if (msg.type === 'shred') {
            shred(msg.target);
            const resp = browse(path.dirname(msg.target));
            resp.sid = msg.sid;
            sendMsg(resp, ws);
        }
        if (msg.type === 'setstartdir') {
            setStartDir(msg.target)
        }
        if (msg.type === 'encrypt' || msg.type === 'decrypt') {
            if (!msg.target.toLowerCase().endsWith('.ezx') && msg.type === 'decrypt')
                throw new Error('Attempted to decrypt file with wrong extension');
            const afterCrypt = () => {
                const resp = browse(path.dirname(msg.target));
                resp.sid = msg.sid;
                sendMsg(resp, ws);
            };
            if (msg.type === 'encrypt') {
                await encrypt(msg.target, msg.phrase);
                afterCrypt()
            }
            if (msg.type === 'decrypt') {
                await decrypt(msg.target, msg.phrase);
                afterCrypt()
            }
        }
    } catch (err) {
        sendMsg({type: 'error', error: err.message, sid: msg.sid}, ws);
        console.error(err)
    }
}

function setStartDir(target) {
    target = cleanPath(target);
    if (!target || !fl.isDirectory(target)) {
        throw new Error('Bad path at setting default directory: ' + target)
    }
    START_DIR = target;
    const content = JSON.stringify({
        startDir: START_DIR,
        port: PORT,
        blackList: BLACK_LIST,
        shredUnlinks: SHRED_UNLINKS
    });
    fs.writeFile(cleanPath('./config.json'), content, 'utf8', () => {
    });
}

function encrypt(target, phrase) {
    return ezlox.encrypt(cleanPath(target), phrase);
}

function decrypt(target, phrase) {
    return ezlox.decrypt(cleanPath(target), phrase);
}

function browse(pth) {
    pth = cleanPath(pth);
    const dirExt = '/';
    const content = fl.listOneDir(pth).map(c => {
        return {
            full: c.full,
            name: path.basename(c.name),
            ext: c.dir ? dirExt : path.extname(c.name).toLowerCase()
        }
    });
    content.unshift({
        full: path.resolve(pth + '/..'),
        name: '(..)',
        ext: dirExt
    });
    const r = {
        type: 'browse',
        hash: null,
        browse: content
    };
    r.target = pth;
    return r
}

function explore(target, ws) {
    exec('start explorer "' + cleanPath(target) + '"', (error, stdout, stderr) => {
        if (error) {
            sendMsg({type: 'error', error: error.message}, ws)
            console.error(error);
            return;
        }
        if (stderr) {
            sendMsg({type: 'error', error: error.message}, ws)
            console.debug(`stderr: ${stderr}`);
            return;
        }
    });
}

function run(target, ws) {

    exec('"' + cleanPath(target) + '"', (error, stdout, stderr) => {
        if (stderr) {
            sendMsg({type: 'error', error: error.message}, ws)
            console.debug(`stderr: ${stderr}`);
        }
    });
}

function shred(target) {
    if (target)
        shr.shredOne(cleanPath(target), SHRED_UNLINKS);
    else
        throw new Error(`Can't shred: bad path ${target}`);
}

function loadConfig() {
    const dPORT = 31444;
    const dBlackList = ['.lnk', '.ini', '.bin'];
    const dShrUnlink = true;
    const dStartDir = 'C:/';
    try {
        const json = require('./config');
        PORT = json.port || dPORT;
        BLACK_LIST = json.blackList || dBlackList;
        fl = new (require('@kxghnpm/kx-file-lister-sync'))({blackList: BLACK_LIST, detailed: true});
        SHRED_UNLINKS = Boolean(json.shredUnlinks);
        START_DIR = json.startDir || dStartDir;
    } catch (err) {
        PORT = dPORT;
        BLACK_LIST = dBlackList;
        fl = new (require('@kxghnpm/kx-file-lister-sync'))({blackList: BLACK_LIST, detailed: true});
        SHRED_UNLINKS = dShrUnlink;
        START_DIR = dStartDir;
        console.warn('Problem reading config, using defaults...')
    }
}

function hashString(target) {
    if (typeof target !== 'string')
        target = JSON.stringify(target);
    const hs = crypto.createHash('sha256');
    hs.update(target);
    hs.end();
    return hs.read().toString('hex')
}

module.exports = {begin, close};