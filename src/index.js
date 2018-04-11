/* eslint-disable no-restricted-syntax, no-await-in-loop */
require('marko/node-require').install({
  compilerOptions: {
    writeToDisk: false,
  },
});
const chalk = require('chalk');
const stackman = require('stackman')();
const path = require('path');
const fs = require('fs');

const currentDirectory = process.cwd();

const getCallsites = err => new Promise((resolve, reject) => {
  stackman.callsites(err, (error, callsites) => {
    if (error) {
      return reject(error);
    }
    return resolve(callsites);
  });
});

const getCallsiteSource = callsite => new Promise((resolve, reject) => {
  callsite.sourceContext(15, (err, source) => {
    if (err) {
      return reject(err);
    }
    return resolve(source);
  });
});

module.exports = class error {
  constructor(options = {}) {
    this.sourceDir = (typeof options.sourceDir === 'string') ? options.sourceDir : './src';
    this.errorTemplatePath = (typeof options.errorTemplatePath === 'string') ? options.errorTemplatePath : './application/error.marko';
  }

  setup(app) {
    app.use(async (ctx, next) => {
      try {
        await next();
        if (ctx.status === 404) {
          const err = new Error('not found');
          err.status = 404;
          throw err;
        }
      } catch (err) {
        ctx.status = err.status || 500;
        if (app.env === 'development') {
          try {
            const bulma = path.join(__dirname, './assets/bulma.css');
            const vue = path.join(__dirname, './assets/vue.min.js');
            const template = require(path.join(__dirname, './templates/development.marko'));
            const stackTrace = [];
            try {
              const callsites = await getCallsites(err);
              for (const callsite of callsites) {
                const lineNumber = callsite.getLineNumber();
                const source = await getCallsiteSource(callsite);
                stackTrace.push({
                  file: path.relative(currentDirectory, callsite.getFileName()),
                  line: lineNumber,
                  source,
                });
              }
            } catch (callsiteError) {
              // do nothing
            }
            ctx.type = 'html';
            const data = {
              bulma,
              vue,
              err,
              ctx,
              stackTrace,
            };
            const injectedData = Object.assign({}, ctx.state, data);
            ctx.body = template.stream(injectedData);
          } catch (templateError) {
            console.log(templateError);
          }
        } else if (fs.existsSync(path.join(
          currentDirectory,
          this.sourceDir,
          this.errorTemplatePath,
        ))) {
          try {
            const template = require(path.join(
              currentDirectory,
              this.sourceDir,
              this.errorTemplatePath,
            ));
            ctx.type = 'html';
            const data = {
              err,
            };
            const injectedData = Object.assign({}, ctx.state, data);
            ctx.body = template.stream(injectedData);
          } catch (templateError) {
            console.log(templateError);
          }
        }
        ctx.app.emit('error', err, ctx);
      }
    });
    process.on('uncaughtException', (err) => {
      console.log();
      console.log(chalk.bold.underline.red(`error: ${err.message}`));
      console.log(chalk.bold('server almost crashed'));
      console.log();
    });
  }
};
