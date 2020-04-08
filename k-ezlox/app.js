const ezlox = require('.')();
const path = require('path');
const fl = new (require('@kxghnpm/kx-file-lister-sync'))({
    blackList: ['.exe', '.dll','.ink','.so','.bat']
});

const WRONG_PASS = 'Wrong password! Try again ';
let dirPath = '';
let filePath = '';

(() => {
    const argPathIdx = process.argv.indexOf('-path');
    if (argPathIdx >= 0 && process.argv.length > argPathIdx) {
        dirPath = process.argv[argPathIdx + 1]
    }
})();

const rl = require('readline');
const rli = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
});

function promptForStartDirPath() {
    rli.question('Enter directory path:\n', answer => {
        dirPath = path.normalize(path.resolve(answer.trim()));
        promptForFile();
    });
}

function promptForFile() {
    const fileList = fl.listFiles(dirPath, false);
    const tmpList = fileList.map(f => path.basename(f));
    tmpList['(other)'] = '(choose different directory)';
    console.table(tmpList);
    rli.question('Enter file index: ', answer => {
        answer = parseInt(answer);
        filePath = fileList[answer];
        if (filePath) {
            promptForPassword();
        } else {
            promptForStartDirPath();
        }
    });
}

function promptForPassword() {
    rli.question('Enter password: ', answer => {
        if (answer) {
            rli.pause();
            crypt(answer).then(r => {
                if (r === WRONG_PASS) {
                    console.error(r);
                    promptForPassword();
                } else {
                    console.log(r);
                    rli.resume();
                    promptForNextAction();
                }
            }).catch(e => {
                console.error(e);
                process.exit(-5);
            });
        } else {
            promptForPassword();
        }
    })
}

async function crypt(pass) {
    try {
        let result;
        if (filePath.toLowerCase().endsWith(ezlox.opts.ext.toLowerCase()))
            result = await ezlox.decrypt(filePath, pass);
        else result = await ezlox.encrypt(filePath, pass);
        return result;
    } catch (err) {
        if (err.message.indexOf('bad decrypt')) {
            return WRONG_PASS;
        } else {
            console.error(err);
            process.exit(-1);
        }
    }
}

function promptForNextAction() {
    const actions = ['enter new directory', 'do another file'];
    actions['(other)'] = 'exit';
    console.table(actions);
    rli.question('Choose another action: ', answer => {
        if (answer == 0 && answer.trim() !== '') {
            promptForStartDirPath();
        } else if (answer == 1) {
            promptForFile();
        } else {
            process.exit(0)
        }
    })
}

if (dirPath)
    promptForFile();
else
    promptForStartDirPath();

