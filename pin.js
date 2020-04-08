const fs = require('fs');
const path = require('path');

const JS_DIST_PATH = path.normalize('webapp/js/');
const PIN_PREFIX = 'vezloxpin';
const PIN_SUFFIX = PIN_PREFIX;
const PIN_PATTERN = new RegExp(PIN_PREFIX + '[a-z\\d]+' + PIN_SUFFIX, 'i');

function genPin() {
    return PIN_PREFIX + Math.random().toString(36).substr(2) +
        Math.random().toString(36).substr(2) + PIN_SUFFIX
}

function genInjectGet() {
    const dirList = fs.readdirSync(JS_DIST_PATH, {withFileTypes: true});
    const gendPin = genPin();
    console.log(gendPin)
    dirList.forEach(f => {
        if (f.name.indexOf('app') === 0 && f.isFile()) {
            const fp = path.join(JS_DIST_PATH, f.name);
            let fileContent = fs.readFileSync(fp);
            fileContent = fileContent.toString().replace(PIN_PATTERN, gendPin);
            fs.writeFileSync(fp, fileContent);
        }
    });
    return gendPin
}

module.exports = {genInjectGet};