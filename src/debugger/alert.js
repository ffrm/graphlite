const chalk = require('chalk');
const toTab = require('./to-tab');

module.exports = function warn() {
  const m = Array
    .from(arguments)
    .map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg)
    .join(' ');
  if (!process.env.WEBPACK_ENV) {
    console.log(chalk.magenta(toTab(m)));
  }
}