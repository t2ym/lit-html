'use strict';

const gulp = require('gulp');
const gulpif = require('gulp-if');
const babel = require('gulp-babel');
const crisper = require('gulp-crisper');
const sourcemaps = require('gulp-sourcemaps');
const vulcanize = require('gulp-vulcanize');
const debug = require('gulp-debug');
const replace = require('gulp-replace');
const uglify = require('gulp-uglify');
const runSequence = require('run-sequence');
const del = require('del');
const gutil = require('gulp-util');
const gulpignore = require('gulp-ignore');
const gulpmatch = require('gulp-match');
const sort = require('gulp-sort');
const grepContents = require('gulp-grep-contents');
const size = require('gulp-size');
const merge = require('gulp-merge');
const through = require('through2');
const path = require('path');
const stripBom = require('strip-bom');
const JSONstringify = require('json-stringify-safe');
const i18nPreprocess = require('gulp-i18n-preprocess');
const i18nLeverage = require('gulp-i18n-leverage');
const XliffConv = require('xliff-conv');
const i18nAddLocales = require('gulp-i18n-add-locales');
const espree = require('espree');

//const logging = require('plylog');
const mergeStream = require('merge-stream');

// Global object to store localizable attributes repository
var attributesRepository = {};

// Bundles object
var prevBundles = {};
var bundles = {};

// Preprocessed templates
var preprocessedTemplates = {};

var title = 'I18N transform';
var srcDir = 'clock';
var tmpDir = 'tmp';
var destDir = 'preprocess';

var xliffOptions = {};

gulp.task('clean', function() {
  return del([
    tmpDir,
    destDir,
  ], { force: true });
});

var indexHTML = gulpif([ '**/index.html' ], gulp.dest(destDir));

function btoa(str) {
  let buf = Buffer.from(str);
  return buf.toString('base64');
}

function atob(base64) {
  let buf = Buffer.from(base64, 'base64');
  return buf.toString();
}

const espreeModuleOptions = {
  loc: false,
  range: false,
  tokens: false,
  comment: false,
  ecmaVersion: 9,
  sourceType: 'module',
  ecmaFeatures: {
    experimentalObjectRestSpread: true
  }
};
const espreeModuleOptionsFull = {
  loc: true,
  range: true,
  tokens: true,
  comment: true,
  ecmaVersion: 9,
  sourceType: 'module',
  ecmaFeatures: {
    experimentalObjectRestSpread: true
  }
};

function UncamelCase (name) {
  return name
    // insert a hyphen between lower & upper
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // space before last upper in a sequence followed by lower
    .replace(/\b([A-Z]+)([A-Z])([a-z0-9])/, '$1 $2$3')
    // replace spaces with hyphens
    .replace(/ /g, '-')
    // lowercase
    .toLowerCase();
}

// Recursively traverse AST to extract HTML template literals
function traverseAst(ast, templates) {
  let target, child, t, index, i, l, item, type, scope, params;
  let inClass = false;
  type = ast.type;
  switch (type) {
  case 'ClassDeclaration':
  case 'ClassExpression':
    if (ast.id && ast.id.name) {
      //console.log(`${ast.type}: name = ${ast.id.name}`);
      templates._classes.push(ast.id.name);
      inClass = true;
    }
    break;
  case 'TaggedTemplateExpression':
    {
      let tag;
      let name;
      //console.log('TaggedTemplateExpression:');
      if (ast.tag.type === 'Identifier') {
        tag = ast.tag.name;
        //console.log('tag=' + ast.tag.name);
      }
      if (ast.quasi.type === 'TemplateLiteral') {
        if (ast.quasi.quasis.length > 0 && ast.quasi.quasis[0].value.raw === '' &&
            ast.quasi.expressions.length > 0) {
          switch (ast.quasi.expressions[0].type) {
          case 'SequenceExpression':
            if (ast.quasi.expressions[0].expressions.length > 0 && ast.quasi.expressions[0].expressions[0].type === 'Literal' &&
                typeof ast.quasi.expressions[0].expressions[0].value === 'string' && ast.quasi.expressions[0].expressions[0].value) {
              name = ast.quasi.expressions[0].expressions[0].value;
              //console.log(`Literal ${ast.quasi.expressions[0].expressions[0].value} in the first expression in the first part`);
            }
            break;
          case 'CallExpression':
            if (ast.quasi.expressions[0].callee.type === 'Identifier' && ast.quasi.expressions[0].callee.name === 'bind') {
              if (ast.quasi.expressions[0].arguments.length === 1) {
                if (ast.quasi.expressions[0].arguments[0].type === 'ThisExpression') {
                  if (templates._classes.length > 0) {
                    name = UncamelCase(templates._classes[templates._classes.length - 1]);
                    //console.log('html`${bind(this)}... for ' + name + ' in class ' + templates._classes[templates._classes.length - 1]);
                  }
                  else {
                    console.error('html`${bind(this)}...` not in a class definition');
                  }
                }
              }
              else if (ast.quasi.expressions[0].arguments.length === 2) {
                if (ast.quasi.expressions[0].arguments[0].type === 'ThisExpression' &&
                    ast.quasi.expressions[0].arguments[1].type === 'Literal' &&
                    typeof ast.quasi.expressions[0].arguments[1].value === 'string' && ast.quasi.expressions[0].arguments[1].value) {
                  name = ast.quasi.expressions[0].arguments[1].value;
                  //console.log('html`${bind(this,\'' + name + '\')}... in the first expression in the first part');
                }
                else if (ast.quasi.expressions[0].arguments[0].type === 'Literal' &&
                         typeof ast.quasi.expressions[0].arguments[0].value === 'string' && ast.quasi.expressions[0].arguments[0].value) {
                  name = ast.quasi.expressions[0].arguments[0].value;
                  //console.log('html`${bind(\'' + name + '\',...)}... in the first expression in the first part');
                }
              }
            }
            break;
          default:
            break;
          }
        }
        if (tag === 'html') {
          let template = '';
          let offset = 0;
          if (name) {
            offset++;
          }
          let i;
          for (i = 0; i + offset < ast.quasi.expressions.length; i++) {
            template += ast.quasi.quasis[i + offset].value.raw;
            template += `{{parts.${i}}}`;
          }
          template += ast.quasi.quasis[i + offset].value.raw;
          /*
          ast.quasi.quasis.forEach((templateElement, index) => {
            if (templateElement.type === 'TemplateElement') {
              console.log(`quasis[${index}].value.raw = ${templateElement.value.raw}`);
            }
            else {
              console.error(`${templateElement.type} in quasis`);
            }
          });
          ast.quasi.expressions.forEach((expression, index) => {
            console.log(`expressions[${index}].type = ${expression.type}`);
          });
          */
          if (name) {
            templates[name] = template;
            //console.log(`template['${name}'] = \`${template}\``);
          }
          else {
            templates.anonymous = templates.anonymous || [];
            templates.anonymous.push(template);
            //console.log(`template['anonymous'] = \`${template}\``);
          }
        }
      }
    }
    break;
  default:
    break;
  }
  for (target in ast) {
    child = ast[target];
    if (child) {
      if (Array.isArray(child)) {
        for (t = child, index = 0, l = t.length; index < l; index++) {
          item = t[index];
          if (item instanceof Object && typeof item.type === 'string') {
            traverseAst(item, templates);
          }
        }
      }
      else if (child instanceof Object && typeof child.type === 'string') {
        traverseAst(child, templates);
      }
    }
  }
  if (inClass) {
    //console.log(`exiting class ${templates._classes.pop()}`);
  }
}

// Extract HTML templates from JavaScript code
function extractHtmlTemplates(code) {
  let targetAst;
  let templates = {
    _classes: []
  };
  try {
    targetAst = espree.parse(code, espreeModuleOptions);
    //console.log(JSONstringify(targetAst, null, 2));
    traverseAst(targetAst, templates);
  }
  catch (e) {
    throw e;
  }
  delete templates._classes;
  return templates;
}

const extractAnonymousTemplates = false; // true For Polymer 3.0 templates

var unmodulize = gulpif(['**/*.js'], through.obj(function (file, enc, callback) {
  let htmlTemplate = `<!-- temporary HTML --><encoded-original><link rel="import" href="../../../i18n-element.html"><innerHTML>`;
  let code = stripBom(String(file.contents));
  let template = null; //code.match(/html`([^`]*)`/);
  let innerHTML = code.match(/[.]innerHTML = `([^`]*)`/);
  let nameFromPath = file.path.split('/').pop().replace(/[.]js$/,'');
  let original = '';
  let templates = extractHtmlTemplates(code);
  //console.log('templates = ' + JSONstringify(templates, null, 2));
  let names = [];
  if (Object.keys(templates).length > 0 || innerHTML) {
    let html = htmlTemplate;
    for (let name in templates) {
      if (name === 'anonymous') {
        if (extractAnonymousTemplates) {
          // For Polymer 3.0 templates
          // Handle the first template only
          name = nameFromPath;
          template = templates.anonymous[0];
          original = btoa(template);
          if (atob(original) !== template) {
            console.error('atob(btoa(template)) !== template');
          }
          html += `<dom-module id="${nameFromPath}"><template>${template.replace(/\\[$]/g, '$')}</template></dom-module>\n`;
          names.push(nameFromPath);
        }
      }
      else {
        // For lit-html templates
        html += `<dom-module id="${name}"><template>${templates[name].replace(/\\[$]/g, '$')}</template></dom-module>\n`;
        names.push(name);
      }      
    }
    if (innerHTML) {
      /*
      original = btoa(innerHTML[1]);
      if (atob(original) !== innerHTML[1]) {
        console.error('atob(btoa(innerHTML[1])) !== innerHTML[1]');
      }
      */
      html = html.replace('<innerHTML>', innerHTML[1].replace(/\\[$]/g, '$'));
    }
    else {
      html = html.replace('<innerHTML>', '');
    }
    //console.log('original', original);
    if (original) {
      html = html.replace('<encoded-original>', `<encoded-original>${original}</encoded-original>`);
    }
    else {
      html = html.replace('<encoded-original>', '');
    }
    let htmlFile = new gutil.File({
      cwd: file.cwd,
      base: file.base,
      path: file.path.substring(0, file.path.length - 3) + '.html',
      contents: new Buffer(html)
    });
    console.log('unmodulize: htmlFile.path = ', htmlFile.path, ' names = ', JSON.stringify(names) /*, 'html = ', html */);
    this.push(htmlFile);
  }
  callback(null, file);
}));

var barrier = function (title) {
  var files = [];
  return through.obj(function (file, enc, callback) {
    files.push(file);
    callback();
  }, function (callback) {
    files.forEach(function (file) {
      this.push(file);
    }, this)
    callback();
    console.log(`barrier ======== ${title} ========`);
  });
};

// Scan HTMLs and construct localizable attributes repository
var scan = gulpif('*.html', i18nPreprocess({
  constructAttributesRepository: true, // construct attributes repository
  attributesRepository: attributesRepository, // output object
  srcPath: srcDir, // path to source root
  targetVersion: 2, // target Polymer version
  attributesRepositoryPath: 
    path.join(tmpDir, 'i18n-attr-repo.html'), // path to i18n-attr-repo.html
  dropHtml: false // do not drop HTMLs
}));

var basenameSort = sort({
  comparator: function(file1, file2) {
    var base1 = path.basename(file1.path).replace(/^bundle[.]/, ' bundle.');
    var base2 = path.basename(file2.path).replace(/^bundle[.]/, ' bundle.');
    return base1.localeCompare(base2);
  }
});

var dropDefaultJSON = gulpignore([ '**/*.json', '!**/locales/*.json' ]);

/* TODO: Feedback preprocessed HTMLs into templates in JavaScript components */
var preprocess = gulpif('**/*.html', i18nPreprocess({
  replacingText: true, // replace UI texts with {{annotations}}
  jsonSpace: 2, // JSON format with 2 spaces
  srcPath: srcDir, // path to source root
  targetVersion: 2, // target Polymer version
  force: true,
  attributesRepository: attributesRepository // input attributes repository
}));

var tmpHTML = gulpif([ '**/*.html' ], gulp.dest(tmpDir));

var dropDummyHTML = gulpif('**/*.html', through.obj(function (file, enc, callback) {
  let temporaryHTML = '<!-- temporary HTML -->';
  let code = stripBom(String(file.contents));
  if (code.indexOf(temporaryHTML) >= 0 || file.path.match(/\/index[.]html$/)) {
    let match1 = code.match(/<encoded-original>(.*)<[/]encoded-original>/);
    let match2 = code.match(/<dom-module id="(.*)"><template localizable-text="embedded">([^`]*)<[/]template><[/]dom-module>/);
    if (match1 && match2) {
      let name = match2[1];
      let original = atob(match1[1]);
      let preprocessed = match2[2];
      console.log('setting preprocessedTemplates name = ' + name);
      preprocessedTemplates[name] = {
        original: original,
        preprocessed: preprocessed,
      };
    }
    console.log('dropDummyHTML dropping ', file.path);
    callback(null, null);
  }
  else {
    callback(null, file);
  }
}));

var preprocessJs = gulpif(['**/*.js'], through.obj(function (file, enc, callback) {
  let code = stripBom(String(file.contents));
  let name = file.path.split('/').pop().replace(/[.]js$/,'');
  if (preprocessedTemplates[name]) {
    if (code.indexOf('html`' + preprocessedTemplates[name].original + '`') < 0) {
      console.error('preprocessJs name = ' + name + ' template not found');
    }
    preprocessedTemplates[name].preprocessed = preprocessedTemplates[name].preprocessed.replace(/\\n/g, '\\\\n').replace(/\\"/g, '\\\\"');
    code = code.replace(
      'html`' + preprocessedTemplates[name].original + '`',
      '((t) => { t.setAttribute("localizable-text", "embedded"); return t; })(html`' + preprocessedTemplates[name].preprocessed + '`)');
    file.contents = Buffer.from(code);
    console.log('preprocessJs name = ' + name);
  }
  callback(null, file);
}));

var tmpJSON = gulpif([ '**/*.json', '!**/locales/*' ], gulp.dest(tmpDir));

var unbundleFiles = [];
var importXliff = through.obj(function (file, enc, callback) {
  // bundle files must come earlier
  unbundleFiles.push(file);
  callback();
}, function (callback) {
  console.log('attributesRepository', attributesRepository);
  var match;
  var file;
  var bundleFileMap = {};
  var xliffConv = new XliffConv(xliffOptions);
  while (unbundleFiles.length > 0) {
    file = unbundleFiles.shift();
    if (path.basename(file.path).match(/^bundle[.]json$/)) {
      prevBundles[''] = JSON.parse(stripBom(String(file.contents)));
      bundleFileMap[''] = file;
    }
    else if (match = path.basename(file.path).match(/^bundle[.]([^.\/]*)[.]json$/)) {
      prevBundles[match[1]] = JSON.parse(stripBom(String(file.contents)));
      bundleFileMap[match[1]] = file;
    }
    else if (match = path.basename(file.path).match(/^bundle[.]([^.\/]*)[.]xlf$/)) {
      xliffConv.parseXliff(String(file.contents), { bundle: prevBundles[match[1]] }, function (output) {
        if (bundleFileMap[match[1]]) {
          bundleFileMap[match[1]].contents = new Buffer(JSONstringify(output, null, 2));
        }
      });
    }
    else if (gulpmatch(file, '**/locales/*.json') &&
             (match = path.basename(file.path, '.json').match(/^([^.]*)[.]([^.]*)/))) {
      if (prevBundles[match[2]] && prevBundles[match[2]][match[1]]) {
        file.contents = new Buffer(JSONstringify(prevBundles[match[2]][match[1]], null, 2));
      }
    }
    this.push(file);
  }
  callback();
});

var leverage = gulpif([ '**/locales/*.json', '!**/locales/bundle.*.json' ], i18nLeverage({
  jsonSpace: 2, // JSON format with 2 spaces
  srcPath: srcDir, // path to source root
  distPath: tmpDir, // path to dist root to fetch next default JSON files
  bundles: bundles // output bundles object
}));

var bundleFiles = [];
var exportXliff = through.obj(function (file, enc, callback) {
  bundleFiles.push(file);
  callback();
}, function (callback) {
  var file;
  var cwd = bundleFiles[0].cwd;
  var base = bundleFiles[0].base;
  var xliffConv = new XliffConv(xliffOptions);
  var srcLanguage = 'en';
  var promises = [];
  var self = this;
  var lang;
  while (bundleFiles.length > 0) {
    file = bundleFiles.shift();
    if (!gulpmatch(file, [ '**/bundle.json', '**/locales/bundle.*.json', '**/xliff/bundle.*.xlf' ])) {
      this.push(file);
    }
  }
  for (lang in bundles) {
    bundles[lang].bundle = true;
    this.push(new gutil.File({
      cwd: cwd,
      base: base,
      path: lang ? path.join(cwd, srcDir, 'locales', 'bundle.' + lang + '.json')
                 : path.join(cwd, srcDir, 'bundle.json'),
      contents: new Buffer(JSONstringify(bundles[lang], null, 2))
    }));
  }
  for (lang in bundles) {
    if (lang) {
      (function (destLanguage) {
        promises.push(new Promise(function (resolve, reject) {
          xliffConv.parseJSON(bundles, {
            srcLanguage: srcLanguage,
            destLanguage: destLanguage
          }, function (output) {
            self.push(new gutil.File({
              cwd: cwd,
              base: base,
              path: path.join(cwd, srcDir, 'xliff', 'bundle.' + destLanguage + '.xlf'),
              contents: new Buffer(output)
            }));
            resolve();
          });
        }));
      })(lang);
    }
  }
  Promise.all(promises).then(function (outputs) {
    callback();
  });
});

var feedback = gulpif([ '**/bundle.json', '**/locales/*.json', '**/*.json', '**/xliff/bundle.*.xlf' ], gulp.dest(srcDir));

var dropXliff = gulpignore([ '**/xliff', '**/xliff/**' ]);

var config = {
  // list of target locales to add
  locales: gutil.env.targets ? gutil.env.targets.split(/ /) : []
}

// Gulp task to add locales to I18N-ready elements and pages
// Usage: gulp locales --targets="{space separated list of target locales}"
gulp.task('locales', function() {
  var elements = gulp.src([ path.join(srcDir, '*.html') ], { base: srcDir });
    //.pipe(grepContents(/(i18n-behavior.html|i18n-element.html)/));
    //.pipe(grepContents(/<dom-module /));

  var pages = gulp.src([ path.join(srcDir, 'index.html') ], { base: srcDir })
    .pipe(grepContents(/<i18n-dom-bind /));

  return merge(elements, pages)
    .pipe(i18nAddLocales(config.locales))
    .pipe(gulp.dest('tmp'))
    .pipe(debug({ title: 'Add locales:'}))
});

gulp.task('i18n', () => {
  return gulp.src([ path.join(srcDir, '**/*') ], { base: srcDir })
    .pipe(indexHTML)
    .pipe(basenameSort)
    .pipe(unmodulize)
    .pipe(scan)
    .pipe(barrier('scan completed'))
    .pipe(dropDefaultJSON)
    .pipe(preprocess)
    .pipe(tmpHTML)
    .pipe(dropDummyHTML)
    .pipe(barrier('drop dummy HTML completed'))
    .pipe(preprocessJs)
    .pipe(tmpJSON)
    .pipe(importXliff)
    .pipe(leverage)
    .pipe(exportXliff)
    .pipe(feedback)
    .pipe(debug({ title: title }))
    .pipe(size({ title: title }))
    .pipe(dropXliff)
    .pipe(gulp.dest(destDir));
});

gulp.task('i18n-attr-repo.html', function () {
  return gulp.src([ '../node_modules/i18n-behavior/i18n-attr-repo.js' ])
    .pipe(through.obj(function (file, enc, callback) {
      let htmlTemplate = `<!-- temporary HTML --><link rel="import" href="../../../i18n-element.html"><innerHTML><dom-module>`;
      let code = stripBom(String(file.contents));
      let template = code.match(/html`([^`]*)`/);
      let innerHTML = code.match(/[.]innerHTML = `([^`]*)`/);
      let name = file.path.split('/').pop().replace(/[.]js$/,'');
      if (template || innerHTML) {
        let html = htmlTemplate;
        if (template) {
          html = html.replace('<dom-module>', 
            `<dom-module id="${name}"><template>${template[1]}</template></dom-module>\n`);
        }
        else {
          html = html.replace('<dom-module>', '');
        }
        if (innerHTML) {
          html = html.replace('<innerHTML>', innerHTML[1].replace(/\\[$]/g, '$'));
        }
        else {
          html = html.replace('<innerHTML>', '');
        }
        let htmlFile = new gutil.File({
          cwd: file.cwd,
          base: file.base,
          path: file.path.substring(0, file.path.length - 3) + '.html',
          contents: new Buffer(html)
        });
        console.log('i18n-attr-repo.html: htmlFile.path = ', htmlFile.path, ' name = ', name /*, 'html = ', html */);
        this.push(htmlFile);
      }
      callback(null, file);
    }))
    .pipe(gulp.dest(tmpDir));
});

gulp.task('default', (cb) => {
  runSequence('clean', 'i18n-attr-repo.html', 'i18n', cb);
});
