import {
  Rule,
  Tree,
  SchematicsException,
  apply,
  url,
  move,
  template,
  chain,
  filter,
  mergeWith,
  SchematicContext,
  forEach,
  Source,
  MergeStrategy,
} from '@angular-devkit/schematics';


import { NodePackageInstallTask, RunSchematicTask } from '@angular-devkit/schematics/tasks';
import { strings, normalize, experimental, JsonObject } from '@angular-devkit/core';
import { Schema as NGXCodeGuardSchema } from './schema';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { format as pretty, Options as prettierConfig } from 'prettier';
import { merge as _merge, omit as _omit } from 'lodash';
import { Observable } from 'rxjs';
import jsonpath from 'jsonpath';

const astUtils = require('esprima-ast-utils');

let prettierConfig: prettierConfig;

interface ExtendedSchema extends NGXCodeGuardSchema {
  [prop: string]: any
}

function readFileAsJSON(path: string): JsonObject {
  return JSON.parse(readFileSync(path).toString());
}

function getBasePath(options: ExtendedSchema): string {
  return options.new ? `/${options.name}` : '';
}

function parseHeaders(options: ExtendedSchema) {
  const ret: any = {};

  if (!options.a11y) {
    return JSON.stringify(ret);
  }

  options.headers.forEach((header: string) => {
    const arr = header.split(':');
    ret[arr[0]] = arr[1]
  });

  return JSON.stringify(ret);
}


function checkArgs(options: ExtendedSchema, _context: SchematicContext) {
  try {
    if (existsSync(options.docDir)) {
      throw new SchematicsException(`The "${options.docDir}" docs directory already exists!`)
    } else if (isNaN(parseInt(options.port as any, 10))) {
      throw new SchematicsException(`The "${options.port}" port number is not an integer!`)
    } else if (options.cypressPort && isNaN(parseInt(options.cypressPort as any, 10))) {
      throw new SchematicsException(`The "${options.cypressPort}" Cypress port number is not an integer!`)
    } else if (options.customWebpack && !existsSync(options.customWebpack)) {
      throw new SchematicsException(`The "${options.customWebpack}" webpack config file doesn't exist!`)
    }
  } catch (e) {
    _context.logger.fatal(`ERROR: ${e.message}`);
    process.exit();
  }
}

function getStyle(workspace: experimental.workspace.WorkspaceSchema, options: ExtendedSchema): JsonObject {
  let schematics = jsonpath.query(workspace.projects[options.name], '$..schematics');
  let result: any = null;

  if (!schematics.length) {
    schematics = jsonpath.query(workspace, '$..schematics');
  }

  for (const schematic of schematics) {
    const data = Object.keys(schematic);
    for (const key of data) {
      const styleKey = schematic[key as string].style ? 'style' : 'styleext';
      if (schematic[key as string][styleKey]) {
        result = schematic[key as string][styleKey] === 'css' ? { syntax: 'css', rules: 'stylelint-config-recommended' }
          : { syntax: schematic[key as string][styleKey], rules: 'stylelint-config-recommended-scss' };
        break;
      }
    }
  }

  if (!result) {
    result = { syntax: 'css', rules: 'stylelint-config-recommended' };
  }

  return result;
}


function isWindows() {
  return process.platform === 'win32';
}

function fileOpenCommand() {
  return isWindows() ? 'start' : 'open';
}

//@ts-ignore
function installPackages(tree: Tree, _context: SchematicContext, options: ExtendedSchema): Rule {

  const rules: Rule[] = [];
  const filePath = join(__dirname, './data/packages.json');
  const packages = readFileAsJSON(filePath);

  const packageJsonPath = `${getBasePath(options)}/package.json`;

  let angularVersion = 0;

  if (options.new) {
    //@ts-ignore
    angularVersion = parseInt(execSync('ng --version').toString().match(/[0-9]{1}/)[0], 10);
  } else {
    //@ts-ignore
    angularVersion = parseInt(readFileAsJSON(`${join(process.cwd(), packageJsonPath)}`).dependencies['@angular/common'].match(/[0-9]{1}/)[0], 10);
  }

  rules.push(updateJSONFile(packageJsonPath, {
    dependencies: packages.dependencies,
    devDependencies: {
      ...packages.devDependencies as JsonObject
    }
  }));

  if (options.useMd) {
    rules.push(updateJSONFile(packageJsonPath, {
      //@ts-ignore
      devDependencies: packages.markdown
    }));
  }

  if (options.useSnyk) {
    rules.push(updateJSONFile(packageJsonPath, {
      //@ts-ignore
      devDependencies: packages.snyk
    }));
  }

  if (options.cypressPort) {
    rules.push(updateJSONFile(packageJsonPath, {
      //@ts-ignore
      devDependencies: {
        ...{ "ngx-build-plus": angularVersion >= 8 ? '^8' : '^7' },
        ...(packages.cypress) as JsonObject,
        ...(options.a11y ? packages.cypressA11y : {}) as JsonObject
      }
    }));
  }

  //@ts-ignore
  const peerDepsString = execSync(`npm info "eslint-config-airbnb-base@latest" peerDependencies`).toString();
  const esLintAndPeerDeps = eval(`new Object(${peerDepsString.replace(/\s/g, '')})`);

  if (options.linter === 'eslint') {
    rules.push(updateJSONFile(packageJsonPath, {
      //@ts-ignore
      devDependencies: { ...{ tslint: packages.tslint.tslint }, ...esLintAndPeerDeps, ...packages.eslint as JsonObject }
    }));
  } else {
    rules.push(updateJSONFile(packageJsonPath, {
      devDependencies: packages.tslint
    }),
      deleteFromJSONFile(packageJsonPath, 'devDependencies', esLintAndPeerDeps as JsonObject));
  }

  return chain(rules);

}

function applyWithOverwrite(source: Source, rules: Rule[], options: ExtendedSchema): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    if (options.new) {
      rules.push(move('/', options.name))
    }
    const rule = mergeWith(
      apply(source, [
        ...rules,
        forEach((fileEntry) => {
          if (tree.exists(fileEntry.path)) {
            tree.overwrite(fileEntry.path, fileEntry.content);
            return null;
          }
          return fileEntry;
        }),

      ]),
      MergeStrategy.AllowOverwriteConflict);

    return rule(tree, _context);
  };
}

//@ts-ignore
function updateWebpackConfig(filePath: string): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const buffer = tree.read(filePath);
    let parsed = astUtils.parse((buffer as Buffer).toString());
    astUtils.parentize(parsed);
    const extraCfgStr = `{
      test: /\.(js|ts)$/,
      loader: 'istanbul-instrumenter-loader',
      options: { esModules: true },
      enforce: 'post',
      include: require('path').join(__dirname, '..', 'src'),
      exclude: [
        /\.(e2e|spec)\.ts$/,
        /node_modules/,
        /(ngfactory|ngstyle)\.js/
      ]
    }
  `;

    const hasIstanbul = astUtils.filter(parsed, function (node: any) {
      return (node.type === 'ObjectExpression' && node.properties.find((prop: any) => {
        return prop.value && prop.value.value === 'istanbul-instrumenter-loader';
      }));
    });

    if (hasIstanbul !== null) {
      return tree;
    }

    const hasRules = astUtils.filter(parsed, function (node: any) {
      return (node.type === 'Identifier' && node.name === 'rules');
    });

    const hasModule = astUtils.filter(parsed, function (node: any) {
      return (node.type === 'Identifier' && node.name === 'module');
    });

    let targetNode: any = null;
    let tokenSkip = 0;
    let codeToInject = extraCfgStr;

    if (hasModule.length === 1) {
      targetNode = hasModule[0];
      tokenSkip = 4;
      codeToInject = 'module: { rules: [' + extraCfgStr + ']},';
    } else if (hasRules === null) {
      targetNode = hasModule[1];
      tokenSkip = 2;
      codeToInject = 'rules: [ ' + extraCfgStr + '],';
    } else {
      targetNode = hasRules[0];
      tokenSkip = 2;
      codeToInject = extraCfgStr + ',';
    }

    const tokenIndex = parsed.tokens.findIndex((token: any) => token.range && token.range[0] === targetNode.range[0]);
    const targetRange = parsed.tokens[tokenIndex + tokenSkip].range;
    astUtils.injectCode(parsed, [targetRange[0] + 1, targetRange[1]], codeToInject)

    tree.overwrite(filePath, pretty(astUtils.getCode(parsed), {
      ...prettierConfig,
      parser: 'babel'
    }));
    return tree;
  };
}

function updateGitIgnore(entries: string[], options: ExtendedSchema): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const path = `${getBasePath(options)}/.gitignore`;
    const contents = tree.read(path)?.toString().split('\n') as string[];
    for (let entry of entries) {
      if (!contents.find(line => line === entry)) {
        contents.push(entry);
      }
    }
    tree.overwrite(path, contents.join('\n'));
    return tree;
  };
}

function updateJSONFile(filePath: string, newContent: JsonObject, exists: boolean = true): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const buffer = !exists ? new Buffer('{}') : tree.read(filePath);
    let content = JSON.parse((buffer as Buffer).toString());
    content = pretty(JSON.stringify(_merge(content, newContent)), {
      ...prettierConfig,
      parser: 'json'
    })
    if (!exists) {
      tree.create(filePath, content)
    } else {
      tree.overwrite(filePath, content);
    }
    return tree;
  };
}

function deleteFromJSONFile(filePath: string, prefix: string, tobeRemoved: JsonObject): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const buffer = tree.read(filePath);
    let content = JSON.parse((buffer as Buffer).toString())
    content = _omit(content, Object.keys(tobeRemoved).map(prop => `${[prefix]}.${prop}`));
    tree.overwrite(filePath, pretty(JSON.stringify(content), {
      ...prettierConfig,
      parser: 'json'
    }));
    return tree;
  };
}

function addCompoDocScripts(options: ExtendedSchema, tree: Tree): Rule {
  let configFile = 'src/tsconfig.app.json';
  if (!tree.exists(configFile)) {
    configFile = 'tsconfig.json';
  }
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:docs:build': `npx compodoc --language ${options.docLocale}`,
      'guard:docs:show': `npx compodoc -s --language ${options.docLocale}`
    }
  });
}

function addWebpackBundleAnalyzerScripts(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:analyze': `npx webpack-bundle-analyzer`
    }
  });
}

function addPa11y(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:a11y': `npx pa11y -c ./pa11y.json`
    }
  });
}

function addNpmAudit(options: ExtendedSchema): Rule {
  const audit = [`npx audit-ci --report-type summary --pass-enoaudit -${options.auditLevel} --config ./audit-ci.json`];
  const auditDev = [`npx audit-ci --report-type full -l`];
  const snyk = 'npx snyk test';

  if (options.useSnyk) {
    audit.push(snyk);
    auditDev.push(snyk + ' --dev')
  }
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:audit': `${options.packageMgr} audit && ${auditDev[1] || '""'}`,
      'guard:audit:ci': audit.join(' && '),
      'guard:audit:dev': auditDev.join(' && ')
    }
  });
}


function addSnykMonitor(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:audit:monitor': 'npx snyk monitor'
    }
  });
}

export function command({ command, args }: { command: string; args: string[]; }): Rule {
  return (host: Tree, _context: SchematicContext) => {
    return new Observable<Tree>(subscriber => {
      const child = spawn(command, args, { stdio: 'inherit' });
      child.on('error', error => {
        subscriber.error(error);
      });
      child.on('close', () => {
        subscriber.next(host);
        subscriber.complete();
      });
      return () => {
        child.kill();
      };
    });
  };
}

function addLintScripts(options: ExtendedSchema, project: experimental.workspace.WorkspaceSchema): Rule {
  const baseCmd = options.packageMgr === 'yarn' ? 'yarn' : 'npm run';
  let npxCommands = [['guard:eslint', 'npx eslint src/**/*.ts']];
  let npmCommands = [`${baseCmd} guard:eslint`];

  const style = getStyle(project, options);

  if (options.linter === 'tslint') {
    npxCommands = [['guard:tslint', 'npx tslint -p tsconfig.json -c tslint.json']];
    npmCommands = [`${baseCmd} guard:tslint`];
  }

  if (style.syntax !== 'styl') {
    if (style.syntax === 'css') {
      npxCommands.push(['guard:stylelint', 'npx stylelint "./src/**/*.css" --format=css']);
      npmCommands.push(`${baseCmd} guard:stylelint`);
    } else {
      npxCommands.push(['guard:stylelint', `npx stylelint "./src/**/*.{${style.syntax},css}"`]);
      npmCommands.push(`${baseCmd} guard:stylelint`);
    }
  }

  npxCommands.push(['guard:jsonlint', `npx jsonlint-cli "./src/**/*.{json,JSON}"`]);
  npmCommands.push(`${baseCmd} guard:jsonlint`);

  if (options.useMd) {
    const mdGlob = isWindows() ? '**/*.{md,MD}' : "'**/*.{md,MD}' ";
    npxCommands.push(['guard:markdownlint', `npx markdownlint ${mdGlob} -i 'node_modules/**' -i '**/node_modules/**' -c mdlint.json`]);
    npmCommands.push(`${baseCmd} guard:markdownlint`);
  }

  npxCommands.push(['guard:lint', npmCommands.join(' && ')])

  let packageMock = { scripts: {} };
  npxCommands.forEach((scriptsDescription) => {
    packageMock.scripts = Object.assign({}, packageMock.scripts, { [scriptsDescription[0]]: scriptsDescription[1] });
  });

  return updateJSONFile(`${getBasePath(options)}/package.json`, packageMock);
}

function addCypressScripts(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    "scripts": {
      "guard:test:headless": `npx cypress run --port ${options.cypressPort}`,
      "guard:test:manual": `npx cypress open  --browser chrome --port ${options.cypressPort}`,
      "guard:test:all": `npx cypress run --browser chrome --port ${options.cypressPort}`,
      "guard:report:html": `npx nyc report --reporter=lcov && ${fileOpenCommand()} coverage/lcov-report/index.html`,
      "guard:report:text": "npx nyc report --reporter=text",
      "guard:report:summary": "npx nyc report --reporter=text-summary",
    },
    "nyc": {
      "extends": "@istanbuljs/nyc-config-typescript",
      "all": true,
      "reporter": [
        "text",
        "html"
      ]
    }
  });
}

function addDevBuilder(options: ExtendedSchema): Rule {
  let webpackCfg = './tests/coverage.webpack.js';
  if (!options.new) {
    webpackCfg = options.customWebpack || webpackCfg;
  }
  return updateJSONFile(`${getBasePath(options)}/angular.json`, {
    projects: {
      [options.name]: {
        architect: {
          'serve': {
            "builder": "ngx-build-plus:dev-server",
            "options": {
              "extraWebpackConfig": webpackCfg
            },
          }
        }
      }
    }
  });
}

export function codeGuard(options: ExtendedSchema): Rule {
  return (tree: Tree, _context: SchematicContext) => {

    const configPath = `${getBasePath(options)}/.codeguardrc`;

    if (options.useConfig) {
      if (tree.exists(configPath)) {
        options = readFileAsJSON('.codeguardrc') as ExtendedSchema;
      } else {
        throw new SchematicsException('Could not find config file ./.codeguardrc');
      }
    }

    checkArgs(options, _context);

    const workspaceConfig = tree.read(`${getBasePath(options)}/angular.json`);
    if (!workspaceConfig) {
      throw new SchematicsException('Could not find Angular workspace configuration');
    }

    const workspaceContent = workspaceConfig.toString();

    const workspace: experimental.workspace.WorkspaceSchema = JSON.parse(workspaceContent);

    if (!options.name) {
      options.name = workspace.defaultProject as string;
    }

    const tsConfig = readFileAsJSON(join(__dirname, 'data/tsconfig_partial.json')) as any;
    prettierConfig = readFileAsJSON(join(__dirname, 'files/.prettierrc'));
    const packageJsonPath = `${getBasePath(options)}/package.json`;
    let packageJson: any = {};

    if (tree.exists(packageJsonPath)) {
      packageJson = JSON.parse(tree.read(`${getBasePath(options)}/package.json`)?.toString() as string);
    }

    const style = getStyle(workspace, options);

    for (const rule of options.compilerFlags) {
      tsConfig.compilerOptions[rule] = false;
    }


    tsConfig.compilerOptions.strictPropertyInitialization = !options.compilerFlags.find(flag => flag === 'strictNullChecks');

    if (options.new) {
      options.style = style.rules as string;
    }

    options.docTitle = options.docTitle || `${options.name} Documentation`;

    const templateOptions: any = {
      ...options,
      ...{
        headers: parseHeaders(options),
        style: style.rules,
        whitelist: JSON.stringify(Object.keys(packageJson.devDependencies))
      },
      classify: strings.classify,
      dasherize: strings.dasherize,
    }

    if (style.syntax !== 'css') {
      templateOptions.postprocessor = `"*.{${style.syntax},css}": [
        "stylelint",
      ],`;
    } else {
      templateOptions.postprocessor = `"*.css": [
        "stylelint --syntax=css",
      ],`;
    }

    const rules = [
      template(templateOptions),
      filter((path) => {
        if (options.useMd) {
          return true;
        } else {
          return path !== '/mdlint.json'
        }
      }),
      filter((path) => {
        if (options.linter === 'eslint') {
          return path !== '/tslint.json';
        } else {
          return path !== '/.eslintrc.js'
        }
      }),
      filter((path) => {
        if (options.cypressPort) {
          return true;
        } else {
          return path !== '/cypress.json' && !path.includes('/tests');
        }
      }),
      filter((path) => {
        if (options.overwrite) {
          return true;
        } else {
          return !tree.exists(path);
        }
      }),
      filter((path) => {
        if (options.a11y) {
          return true;
        } else {
          return path !== '/pa11y.json'
        }
      }),
      filter((path) => {
        if (options.sonarId) {
          return true;
        } else {
          return path !== '/sonar-project.properties'
        }
      }),
      filter((path) => {
        if (!options.customWebpack) {
          return true;
        } else {
          return path !== '/tests/coverage.webpack.js'
        }
      }),
      filter((path) => {
        const blistpath = '/browserslist';
        if (!tree.exists(blistpath)) {
          return true;
        } else {
          return path !== blistpath;
        }
      }),
      filter((path) => {
        if (style.syntax !== 'styl') {
          return true;
        } else {
          return path !== '/.stylelintrc'
        }
      })
    ];

    _context.addTask(new NodePackageInstallTask({
      packageManager: options.packageMgr,
      workingDirectory: options.new ? options.name : '.',
      quiet: true
    }));

    if (options.useSnyk) {
      _context.addTask(new RunSchematicTask('command', { command: isWindows() ? 'npx.cmd' : 'npx', args: ['snyk', 'auth'] }));
    }

    const source = url('./files');

    const commonRules = [
      installPackages(tree, _context, options),
      addCompoDocScripts(options, tree),
      addWebpackBundleAnalyzerScripts(options),
      addLintScripts(options, workspace),
      addNpmAudit(options),
    ]

    if (options.useSnyk) {
      commonRules.push(addSnykMonitor(options));
    }

    if (options.docDir) {
      commonRules.push(updateGitIgnore([options.docDir.charAt(0) === '.' ? options.docDir.substr(1) : options.docDir], options));
    }

    if (!options.new && options.customWebpack) {
      commonRules.push(updateWebpackConfig(options.customWebpack));
    }

    if (options.a11y) {
      commonRules.push(addPa11y(options));
    }

    if (options.saveConfig) {
      commonRules.push(updateJSONFile(configPath, _omit(options, 'new'), tree.exists(configPath)));
    }

    if (options.cypressPort) {
      commonRules.push(
        addCypressScripts(options),
        addDevBuilder(options));
    }



    if (options.overwrite) {
      return chain([
        ...commonRules,
        updateJSONFile(`${getBasePath(options)}/tsconfig.json`, tsConfig),
        applyWithOverwrite(source, rules, options)
      ]);
    } else {
      return chain([
        ...commonRules,
        move(normalize(getBasePath(options) as string)),
        mergeWith(apply(source, rules), MergeStrategy.AllowOverwriteConflict)
      ])
    }

  };
}
