"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schematics_1 = require("@angular-devkit/schematics");
const tasks_1 = require("@angular-devkit/schematics/tasks");
const core_1 = require("@angular-devkit/core");
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
const prettier_1 = require("prettier");
const lodash_1 = require("lodash");
let prettierConfig;
function readFileAsJSON(path) {
    return JSON.parse(fs_1.readFileSync(path).toString());
}
function getBasePath(options) {
    return options.new ? `/${options.ngProject || options.name}` : '';
}
function getStyle(project) {
    const schematics = project.schematics || {};
    const data = Object.keys(schematics);
    let result = {};
    for (const key of data) {
        if (schematics[key].style) {
            result = schematics[key].style === 'css' ? { syntax: 'css', rules: 'stylelint-config-recommended' }
                : { syntax: schematics[key].style, rules: 'stylelint-config-recommended-scss' };
        }
    }
    return result;
}
//@ts-ignore
function installPackages(tree, _context, options) {
    const rules = [];
    const filePath = path_1.join(__dirname, './data/packages.json');
    const packages = readFileAsJSON(filePath);
    const packageJsonPath = `${getBasePath(options)}/package.json`;
    rules.push(updateJSONFile(packageJsonPath, {
        dependencies: packages.dependencies,
        devDependencies: Object.assign(Object.assign({}, packages.devDependencies), {
            [options.commitRule]: options.commitRuleVersion
        })
    }));
    if (options.useMd) {
        rules.push(updateJSONFile(packageJsonPath, {
            devDependencies: packages.optionalDevDependencies
        }));
    }
    //@ts-ignore
    const peerDepsString = child_process_1.execSync(`npm info "eslint-config-airbnb-base@${packages.eslint['eslint-config-airbnb-base']}" peerDependencies`).toString();
    const esLintAndPeerDeps = eval(`new Object(${peerDepsString.replace(/\s/g, '')})`);
    if (options.linter === 'eslint') {
        rules.push(updateJSONFile(packageJsonPath, {
            devDependencies: esLintAndPeerDeps
        }), deleteFromJSONFile(packageJsonPath, 'devDependencies', packages.tslint));
    }
    else {
        rules.push(updateJSONFile(packageJsonPath, {
            devDependencies: packages.tslint
        }), deleteFromJSONFile(packageJsonPath, 'devDependencies', esLintAndPeerDeps));
    }
    return schematics_1.chain(rules);
}
function applyWithOverwrite(source, rules, options) {
    return (tree, _context) => {
        if (options.new) {
            rules.push(schematics_1.move('/', options.ngProject));
        }
        const rule = schematics_1.mergeWith(schematics_1.apply(source, [
            ...rules,
            schematics_1.forEach((fileEntry) => {
                if (tree.exists(fileEntry.path)) {
                    tree.overwrite(fileEntry.path, fileEntry.content);
                    return null;
                }
                return fileEntry;
            }),
        ]), schematics_1.MergeStrategy.AllowOverwriteConflict);
        return rule(tree, _context);
    };
}
function updateJSONFile(filePath, newContent) {
    return (tree, _context) => {
        const buffer = tree.read(filePath);
        let content = JSON.parse(buffer.toString());
        content = lodash_1.merge(content, newContent);
        tree.overwrite(filePath, prettier_1.format(JSON.stringify(content), Object.assign(Object.assign({}, prettierConfig), { parser: 'json' })));
        return tree;
    };
}
function deleteFromJSONFile(filePath, prefix, tobeRemoved) {
    return (tree, _context) => {
        const buffer = tree.read(filePath);
        let content = JSON.parse(buffer.toString());
        content = lodash_1.omit(content, Object.keys(tobeRemoved).map(prop => `${[prefix]}.${prop}`));
        tree.overwrite(filePath, prettier_1.format(JSON.stringify(content), Object.assign(Object.assign({}, prettierConfig), { parser: 'json' })));
        return tree;
    };
}
function addCompoDocScripts(options) {
    const title = options.docTitle || `${options.ngProject} Documentation`;
    const output = options.docDir ? `-d ${options.docDir}` : '';
    return updateJSONFile(`${getBasePath(options)}/package.json`, {
        scripts: {
            'build-docs': `compodoc -p tsconfig.json -n \"${title}\" ${output} --language en-EN`,
            'docs': `compodoc -o`
        }
    });
}
function addCypressScripts(options) {
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
function codeGuard(options) {
    return (tree, _context) => {
        const workspaceConfig = tree.read(`${getBasePath(options)}/angular.json`);
        if (!workspaceConfig) {
            throw new schematics_1.SchematicsException('Could not find Angular workspace configuration');
        }
        const workspaceContent = workspaceConfig.toString();
        const workspace = JSON.parse(workspaceContent);
        if (!options.ngProject) {
            options.ngProject = workspace.defaultProject;
        }
        const projectName = options.ngProject;
        const tsConfig = readFileAsJSON(path_1.join(__dirname, 'data/tsconfig_partial.json'));
        const project = workspace.projects[projectName];
        prettierConfig = readFileAsJSON(path_1.join(__dirname, 'files/.prettierrc'));
        const style = getStyle(project);
        if (options.new) {
            options.style = style.rules;
        }
        const templateOptions = Object.assign(Object.assign({}, options), { classify: core_1.strings.classify, dasherize: core_1.strings.dasherize });
        if (style.syntax !== 'css') {
            templateOptions.postprocessor = `"*.${style.syntax}": [
        "stylelint --syntax=${style.syntax}",
        "git add"
      ],`;
        }
        const rules = [
            schematics_1.template(templateOptions),
            schematics_1.filter((path) => {
                if (options.useMd) {
                    return true;
                }
                else {
                    return path !== '/mdlint.json';
                }
            }),
            schematics_1.filter((path) => {
                if (options.linter === 'eslint') {
                    return path !== '/tslint.json';
                }
                else {
                    return path !== '/eslint.json';
                }
            }),
            schematics_1.filter((path) => {
                if (options.cypressPort) {
                    return true;
                }
                else {
                    return path !== '/cypress.json' && !path.includes('/tests');
                }
            }),
            schematics_1.filter((path) => {
                if (options.overwrite) {
                    return true;
                }
                else {
                    return !tree.exists(path);
                }
            })
        ];
        _context.addTask(new tasks_1.NodePackageInstallTask({
            packageManager: options.packageMgr,
            workingDirectory: options.new ? options.ngProject : '.',
            quiet: true
        }));
        const source = schematics_1.url('./files');
        const commonRules = [
            installPackages(tree, _context, options),
            addCompoDocScripts(options),
        ];
        if (options.cypressPort) {
            commonRules.push(addCypressScripts(options));
        }
        if (options.overwrite) {
            return schematics_1.chain([
                ...commonRules,
                updateJSONFile(`${getBasePath(options)}/tsconfig.json`, tsConfig),
                applyWithOverwrite(source, rules, options)
            ]);
        }
        else {
            return schematics_1.chain([
                ...commonRules,
                schematics_1.move(core_1.normalize(getBasePath(options))),
                schematics_1.mergeWith(schematics_1.apply(source, rules), schematics_1.MergeStrategy.AllowOverwriteConflict)
            ]);
        }
    };
}
exports.codeGuard = codeGuard;
//# sourceMappingURL=index.js.map