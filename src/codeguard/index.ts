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
  MergeStrategy
} from '@angular-devkit/schematics';

import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { strings, normalize, experimental, JsonObject } from '@angular-devkit/core';
import { Schema as NGXCodeGuardSchema } from './schema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { format as pretty, Options as prettierConfig } from 'prettier';
import { merge as _merge, omit as _omit } from 'lodash';

let prettierConfig: prettierConfig;

interface ExtendedSchema extends NGXCodeGuardSchema {
  [prop: string]: any
}

function readFileAsJSON(path: string): JsonObject {
  return JSON.parse(readFileSync(path).toString());
}

function getBasePath(options: ExtendedSchema): string {
  return options.new ? `/${options.ngProject || options.name}` : '';
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

  rules.push(updateJSONFile(packageJsonPath, {
    dependencies: packages.dependencies,
    devDependencies: {
      ...packages.devDependencies as JsonObject, ...{
        [options.commitRule]: options.commitRuleVersion
      }
    }
  }));

  if (options.useMd) {
    rules.push(updateJSONFile(packageJsonPath, {
      devDependencies: packages.optionalDevDependencies
    }));
  }

  //@ts-ignore
  const peerDepsString = execSync(`npm info "eslint-config-airbnb-base@${packages.eslint['eslint-config-airbnb-base']}" peerDependencies`).toString();
  const esLintAndPeerDeps = eval(`new Object(${peerDepsString.replace(/\s/g, '')})`);

  if (options.linter === 'eslint') {
    rules.push(updateJSONFile(packageJsonPath, {
      devDependencies: esLintAndPeerDeps
    }),
      deleteFromJSONFile(packageJsonPath, 'devDependencies', packages.tslint as JsonObject));
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
      rules.push(move('/', options.ngProject))
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

function addCompoDocScripts(options: ExtendedSchema): Rule {
  const title = options.docTitle || `${options.ngProject} Documentation`;
  const output = options.docDir ? `-d ${options.docDir}` : '';
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    scripts: {
      'build-docs': `compodoc -p tsconfig.json -n \"${title}\" ${output} --language en-EN`,
      'docs': `compodoc -o`
    }
  });
}

function addCypressScripts(options: ExtendedSchema): Rule {
  return updateJSONFile(`${getBasePath(options)}/package.json`, {
    "scripts": {
      "e2e:headless": `npx cypress run --port ${options.cypressPort}`,
      "e2e:headless:rec": `npx cypress run --port ${options.cypressPort}  -e RECORD=true`,
      "e2e:manual:rec": `npx cypress open  --browser chrome --port ${options.cypressPort} -e RECORD=true`,
      "e2e:manual": `npx cypress open  --browser chrome --port ${options.cypressPort}`,
      "e2e:all": `npx cypress run --browser chrome --port ${options.cypressPort}`,
      "e2e:all:rec": `npx cypress run --browser chrome --port ${options.cypressPort} -e RECORD=true`,
      "e2e:coverage:text": "npx nyc report --reporter=text-summary",
      "e2e:coverage:html": "npx nyc report --reporter=lcov",
      "e2e:coverage": "open coverage/lcov-report/index.html",
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

export function codeGuard(options: ExtendedSchema): Rule {
  return (tree: Tree, _context: SchematicContext) => {

    const workspaceConfig = tree.read(`${getBasePath(options)}/angular.json`);
    if (!workspaceConfig) {
      throw new SchematicsException('Could not find Angular workspace configuration');
    }

    const workspaceContent = workspaceConfig.toString();

    const workspace: experimental.workspace.WorkspaceSchema = JSON.parse(workspaceContent);
    if (!options.ngProject) {
      options.ngProject = workspace.defaultProject as string;
    }

    const projectName = options.ngProject as string;
    const tsConfig = readFileAsJSON(join(__dirname, 'data/tsconfig_partial.json'));
    const project = workspace.projects[projectName];
    prettierConfig = readFileAsJSON(join(__dirname, 'files/.prettierrc'));
    const style = getStyle(project);

    if (options.new) {
      options.style = style.rules as string;
    }

    const templateOptions: any = {
      ...options,
      classify: strings.classify,
      dasherize: strings.dasherize,
    }

    if(style.syntax !== 'css') {
      templateOptions.postprocessor =  `"*.${style.syntax}": [
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
          return path !== '/eslint.json'
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
      })
    ];

    _context.addTask(new NodePackageInstallTask({
      packageManager: options.packageMgr,
      workingDirectory: options.new ? options.ngProject : '.',
      quiet: true
    }));

    const source = url('./files');

    const commonRules = [
      installPackages(tree, _context, options),
      addCompoDocScripts(options),
    ]

    if (options.cypressPort) {
      commonRules.push(addCypressScripts(options));
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
