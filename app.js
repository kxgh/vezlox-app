const {begin, close} = require('.');
const {exec} = require("child_process");
const HTML_DIST_PATH = './webapp/index.html';

begin();

exec(`"${HTML_DIST_PATH}"`, (error, stdout, stderr) => {
    if (error) {
        console.error(error);
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
    }
});
const exit = () => {
    close();
    process.exit(0)
};
process.on('SIGINT', exit);
process.on('SIGTERM', exit);
process.on('SIGKILL', exit);