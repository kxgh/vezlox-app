/**
 * @author kxgh
 */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const shr = require('@kxghnpm/kx-shredder-sync');

module.exports = function (opts) {
    const CIPHER_ALG = 'aes256';
    const HASH_ALG = 'sha256';
    const IV_SIZE = 16;
    const ENC_HASH_SIZE = 48;
    const SUCCESS_RET = 'ok';
    let shredder;
    const hash = what => {
        return crypto.createHash(HASH_ALG).update(what).digest();
    };
    const encryptHash = (h, pass, iv) => {
        const cipher = crypto.createCipheriv(CIPHER_ALG, hash(pass), iv);
        let encrypted = cipher.update(h);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        if (encrypted.length !== ENC_HASH_SIZE)
            throw new Error('somethings not right');
        return encrypted;
    };
    const decryptHash = (h, pass, iv) => {
        const cipher = crypto.createDecipheriv(CIPHER_ALG, hash(pass), iv);
        let decrypted = cipher.update(h);
        decrypted = Buffer.concat([decrypted, cipher.final()]);
        return decrypted;
    };
    const ezlox = {
        opts: {
            ext: '.ezx',
            shredAfterEncrypt: true,
            unlinkAfterEncrypt: true,
            shredAfterDecrypt: true,
            unlinkAfterDecrypt: true
        },
        hashFile: function (pth) {
            return new Promise((resolve, reject) => {
                    const hash = crypto.createHash('sha256');
                    const readStream = fs.createReadStream(pth);
                    readStream.pipe(hash);
                    readStream.on('end', function (h) {
                        hash.end();
                        resolve(hash.read());
                    })
                }
            );
        },
        encrypt: function (pth, password) {
            return new Promise((resolve, reject) => {
                pth = path.normalize(path.resolve(pth));
                const targPath = pth + this.opts.ext;
                const readStream = fs.createReadStream(pth);
                const writeStream = fs.createWriteStream(targPath);
                const gzipStream = zlib.createGzip();

                const iv = Buffer.alloc(IV_SIZE, crypto.randomBytes(16));
                const cipherKey = hash(password);
                const cipher = crypto.createCipheriv(CIPHER_ALG, cipherKey, iv);

                const hashingCompletePromise = new Promise((resolve, reject) => {
                    const hashStream = crypto.createHash(HASH_ALG);
                    readStream.on('data', data => {
                        hashStream.update(data);
                    });
                    readStream.on('end', () => {
                        hashStream.end();
                        resolve(hashStream.read())
                    });
                    readStream.on('error', err => {
                        reject(err);
                    })
                });
                writeStream.on('finish', function () {
                    hashingCompletePromise.then(resultHash => {
                        resultHash = encryptHash(resultHash,password,iv);
                        const writtenFile = fs.openSync(targPath,'r+',0o666);
                        fs.writeSync(writtenFile,resultHash,0,resultHash.length,IV_SIZE);
                        fs.closeSync(writtenFile);
                        if (ezlox.opts.shredAfterEncrypt) {
                            console.log('SHREDDING ' + pth);
                            shredder.shredOne(pth, ezlox.opts.unlinkAfterEncrypt);
                        }
                        resolve(SUCCESS_RET);
                    }).catch(err => {
                        reject(err)
                    });
                });
                try {
                    writeStream.write(iv);
                    writeStream.write(Buffer.allocUnsafe(ENC_HASH_SIZE)); // dummy encrypted hash; will be overwritten
                    readStream.pipe(gzipStream).pipe(cipher).pipe(writeStream);
                } catch (e) {
                    reject(e)
                }
            });
        },
        decrypt: function (pth, password) {
            const readHeader = fs.createReadStream(pth, {end: ENC_HASH_SIZE + IV_SIZE - 1});
            return new Promise((resolve, reject) => {
                readHeader.on('data', hd => {
                    try {
                        const iv = hd.slice(0, IV_SIZE);
                        const fileHeaderHash = decryptHash(hd.slice(IV_SIZE, ENC_HASH_SIZE + IV_SIZE), password, iv);

                        const resultFilePath = pth.substr(0, pth.length - (this.opts.ext.length));

                        const readStream = fs.createReadStream(pth, {start: IV_SIZE + ENC_HASH_SIZE});
                        const decipherKey = hash(password);
                        const decipher = crypto.createDecipheriv(CIPHER_ALG, decipherKey, iv);
                        const unzipStream = zlib.createGunzip();
                        const writeStream = fs.createWriteStream(resultFilePath);

                        const hashingCompletePromise = new Promise((resolve, reject) => {
                            const hashStream = crypto.createHash(HASH_ALG);
                            unzipStream.on('data', data => {
                                hashStream.update(data);
                            });
                            unzipStream.on('end', () => {
                                hashStream.end();
                                resolve(hashStream.read())
                            });
                            unzipStream.on('error', err => {
                                reject(err);
                            })
                        });

                        writeStream.on('finish', function (e) {
                            hashingCompletePromise.then(resultHash => {
                                if (!fileHeaderHash.equals(resultHash)) {
                                    reject(new Error(`Invalid checksum for ${pth}, shredding ${resultFilePath}`))
                                    shredder.shredOne(resultFilePath, ezlox.opts.unlinkAfterDecrypt);
                                } else {
                                    if (ezlox.opts.shredAfterDecrypt) {
                                        console.log(`Decrypt ok, shredding ${pth}`);
                                        shredder.shredOne(pth, ezlox.opts.unlinkAfterDecrypt);
                                    }
                                    resolve(SUCCESS_RET);
                                }
                            }).catch(err => {
                                reject(err)
                            });
                        });

                        readStream.pipe(decipher).pipe(unzipStream).pipe(writeStream);
                    } catch (err) {
                        reject(err)
                    }
                });
            });
        }
    };
    if (opts)
        Object.keys(opts).forEach(k => ezlox.opts[k] = opts[k])
    shredder = shr.createShredder();
    return ezlox;
};