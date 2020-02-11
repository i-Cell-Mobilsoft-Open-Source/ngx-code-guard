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


import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { strings, normalize, experimental, JsonObject } from '@angular-devkit/core';
import { Schema as NGXCodeGuardSchema } from './schema';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { format as pretty, Options as prettierConfig } from 'prettier';
import { merge as _merge, omit as _omit } from 'lodash';
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
    if(existsSync(options.docDir)) {
      throw new SchematicsException(`The "${options.docDir}" docs directory already exists!`)
    } else if(isNaN(parseInt(options.port as any, 10))) {
      throw new SchematicsException(`The "${options.port}" port number is not an integer!`)
    } else if(options.cypressPort && isNaN(parseInt(options.cypressPort as any, 10))) {
      throw new SchematicsException(`The "${options.cypressPort}" Cypress port number is not an integer!`)
    } else if(options.customWebpack && !existsSync(options.customWebpack)) {
      throw new SchematicsException(`The "${options.customWebpack}" webpack config file doesn't exist!`)
    }  
  } catch(e) {
    _context.logger.fatal(`ERROR: ${e.message}`);
    process.exit();
  }
}

function getStyle(project: experimental.workspace.WorkspaceProject): JsonObject {
  const schematics = project.schematics || {};
  const data = Object.keys(schematics);
  let result = {}
  for (const key of data) {
    if (schematics[key].style) {
      result = schematics[key].style === 'css' ? { syntax: 'css', rules: 'stylelint-config-recommended' }
        : { syntax: schematics[key].style, rules: 'stylelint-config-recommended-scss' };
    }
  }

  return result;
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
      ...packages.devDependencies as JsonObject, ...{
        [options.commitRule]: 'latest'
      }
    }
  }));

  if (options.useMd) {
    rules.push(updateJSONFile(packageJsonPath, {
      //@ts-ignore
      devDependencies: packages.markdown
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

    const hasIstanbul  = astUtils.filter(parsed, function (node: any) {
      return (node.type === 'ObjectExpression' && node.properties.find((prop:any) => {
        return prop.value && prop.value.value === 'istanbul-instrumenter-loader';
      }));
    });

    if(hasIstanbul !== null) {
     return tree;
    }

    const hasRules  = astUtils.filter(parsed, function (node: any) {
      return (node.type === 'Identifier' && node.name === 'rules');
    });

    const hasModule  = astUtils.filter(parsed, function (node: any) {
      return (node.type === 'Identifier' && node.name === 'module');
    });

    let targetNode: any = null;
    let tokenSkip = 0;
    let codeToInject = extraCfgStr;

    if(hasModule.length === 1) {
      targetNode = hasModule[0];
      tokenSkip = 4;
      codeToInject = 'module: { rules: ['+extraCfgStr+']},';
    } else if(hasRules === null) {
      targetNode = hasModule[1];
      tokenSkip = 2;
      codeToInject = 'rules: [ '+extraCfgStr+'],';
    } else {
      targetNode = hasRules[0];
      tokenSkip = 2;
      codeToInject = extraCfgStr+',';
    }

    const tokenIndex = parsed.tokens.findIndex((token: any) => token.range && token.range[0] === targetNode.range[0]);
    const targetRange = parsed.tokens[tokenIndex+tokenSkip].range;
    astUtils.injectCode(parsed, [targetRange[0]+1, targetRange[1]], codeToInject)
  
    tree.overwrite(filePath, pretty(astUtils.getCode(parsed), {
      ...prettierConfig,
      parser: 'babel'
    }));
    return tree;
  };
}

function updateJSONFile(filePath: string, newContent: JsonObject): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const buffer = tree.read(filePath);
    let content = JSON.parse((buffer as Buffer).toString());
    content = _merge(content, newContent);
    tree.overwrite(filePath, pretty(JSON.stringify(content), {
      ...prettierConfig,
      parser: 'json'
    }));
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
  const title = options.docTitle || `${options.name} Documentation`;
  const output = options.docDir ? `-d ${options.docDir}` : '';
  let configFile = 'src/tsconfig.app.json';
  if(!tree.exists(configFile)) {
    configFile = 'tsconfig.json';
  }
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:docs:build': `npx compodoc -p ${configFile} -n \"${title}\" ${output} --language en-EN`,
      'guard:docs:show': `open ${options.docDir}/index.html`
    }
  });
}

function addWebpackBundleAnalyzerScripts(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:analyze': `npx webpack-bundle-analyzer ${options.statsFile}`
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
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:audit': `npx npm-audit-ci-wrapper -t high -p`
    }
  });
}

function addLintScripts(options: ExtendedSchema): Rule {
  let cmd = 'npx eslint src/**/*.ts';
  if (options.linter === 'tslint') {
    cmd = 'npx tslint -p tsconfig.json -c tslint.json';
  }
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'guard:lint': cmd
    }
  });
}

function addCypressScripts(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    "scripts": {
      "guard:test:headless": `npx cypress run --port ${options.cypressPort}`,
      "guard:test:manual": `npx cypress open  --browser chrome --port ${options.cypressPort}`,
      "guard:test:all": `npx cypress run --browser chrome --port ${options.cypressPort}`,
      "guard:report:html": "npx nyc report --reporter=lcov && open coverage/lcov-report/index.html",
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

    const projectName = options.name as string;
    const tsConfig = readFileAsJSON(join(__dirname, 'data/tsconfig_partial.json'));
    const project = workspace.projects[projectName];
    prettierConfig = readFileAsJSON(join(__dirname, 'files/.prettierrc'));
    const style = getStyle(project);


    if (options.new) {
      options.style = style.rules as string;
    }

    const templateOptions: any = {
      ...options,
      ...{ headers: parseHeaders(options) },
      classify: strings.classify,
      dasherize: strings.dasherize,
    }

    if (style.syntax !== 'css') {
      templateOptions.postprocessor = `"*.${style.syntax}": [
        "stylelint --syntax=${style.syntax}",
        "git add"
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
      })
    ];

    _context.addTask(new NodePackageInstallTask({
      packageManager: options.packageMgr,
      workingDirectory: options.new ? options.name : '.',
      quiet: true
    }));

    const source = url('./files');

    const commonRules = [
      installPackages(tree, _context, options),
      addCompoDocScripts(options, tree),
      addWebpackBundleAnalyzerScripts(options),
      addLintScripts(options),
      addNpmAudit(options)
    ]

    if (!options.new && options.customWebpack) {
      commonRules.push(updateWebpackConfig(options.customWebpack));
    }
    
    if(options.a11y) {
      commonRules.push(addPa11y(options));
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
