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
    return options.new ? `/${options.name}` : '';
}
function parseHeaders(options) {
    const ret = {};
    if (!options.a11y) {
        return JSON.stringify(ret);
    }
    options.headers.forEach((header) => {
        const arr = header.split(':');
        ret[arr[0]] = arr[1];
    });
    return JSON.stringify(ret);
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
    let angularVersion = 0;
    if (options.new) {
        //@ts-ignore
        angularVersion = parseInt(child_process_1.execSync('ng --version').toString().match(/[0-9]{1}/)[0], 10);
    }
    else {
        //@ts-ignore
        angularVersion = parseInt(readFileAsJSON(`${path_1.join(process.cwd(), packageJsonPath)}`).dependencies['@angular/common'].match(/[0-9]{1}/)[0], 10);
    }
    rules.push(updateJSONFile(packageJsonPath, {
        dependencies: packages.dependencies,
        devDependencies: Object.assign(Object.assign({}, packages.devDependencies), {
            [options.commitRule]: 'latest'
        })
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
            devDependencies: Object.assign(Object.assign({ "ngx-build-plus": angularVersion >= 8 ? '^8' : '^7' }, (packages.cypress)), (options.a11y ? packages.cypressA11y : {}))
        }));
    }
    //@ts-ignore
    const peerDepsString = child_process_1.execSync(`npm info "eslint-config-airbnb-base@latest" peerDependencies`).toString();
    const esLintAndPeerDeps = eval(`new Object(${peerDepsString.replace(/\s/g, '')})`);
    if (options.linter === 'eslint') {
        rules.push(updateJSONFile(packageJsonPath, {
            //@ts-ignore
            devDependencies: Object.assign(Object.assign({ tslint: packages.tslint.tslint }, esLintAndPeerDeps), packages.eslint)
        }));
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
            rules.push(schematics_1.move('/', options.name));
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
    const title = options.docTitle || `${options.name} Documentation`;
    const output = options.docDir ? `-d ${options.docDir}` : '';
    return updateJSONFile(`${getBasePath(options)}/package.json`, {
        scripts: {
            'guard:docs:build': `npx compodoc -p tsconfig.json -n \"${title}\" ${output} --language en-EN`,
            'guard:docs:show': `open ${options.docDir}/index.html`
        }
    });
}
function addWebpackBundleAnalyzerScripts(options) {
    return updateJSONFile(`${getBasePath(options)}/package.json`, {
        scripts: {
            'guard:analyze': `npx webpack-bundle-analyzer ${options.statsFile}`
        }
    });
}
function addLintScripts(options) {
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
function addCypressScripts(options) {
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
function addDevBuilder(options) {
    return updateJSONFile(`${getBasePath(options)}/angular.json`, {
        projects: {
            [options.name]: {
                architect: {
                    serve: {
                        "builder": "ngx-build-plus:dev-server",
                        "options": {
                            "extraWebpackConfig": "./tests/coverage.webpack.js"
                        },
                    }
                }
            }
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
        if (!options.name) {
            options.name = workspace.defaultProject;
        }
        const projectName = options.name;
        const tsConfig = readFileAsJSON(path_1.join(__dirname, 'data/tsconfig_partial.json'));
        const project = workspace.projects[projectName];
        prettierConfig = readFileAsJSON(path_1.join(__dirname, 'files/.prettierrc'));
        const style = getStyle(project);
        if (options.new) {
            options.style = style.rules;
        }
        const templateOptions = Object.assign(Object.assign(Object.assign({}, options), { headers: parseHeaders(options) }), { classify: core_1.strings.classify, dasherize: core_1.strings.dasherize });
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
                    return path !== '/.eslintrc.js';
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
            }),
            schematics_1.filter((path) => {
                if (options.a11y) {
                    return true;
                }
                else {
                    return path !== '/pa11y.json';
                }
            }),
            schematics_1.filter((path) => {
                if (options.sonarId) {
                    return true;
                }
                else {
                    return path !== '/sonar-project.properties';
                }
            })
        ];
        _context.addTask(new tasks_1.NodePackageInstallTask({
            packageManager: options.packageMgr,
            workingDirectory: options.new ? options.name : '.',
            quiet: true
        }));
        const source = schematics_1.url('./files');
        const commonRules = [
            installPackages(tree, _context, options),
            addCompoDocScripts(options),
            addWebpackBundleAnalyzerScripts(options),
            addLintScripts(options)
        ];
        if (options.cypressPort) {
            commonRules.push(addCypressScripts(options), addDevBuilder(options));
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