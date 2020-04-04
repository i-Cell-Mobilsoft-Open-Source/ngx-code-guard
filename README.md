# NGX Code Guard

# Table of Contents

-   [Features](#features)
-   [Installation](#installation)
-   [New Projects](#new-projects)
-   [Existing projects](#existing-projects)
-   [Usage](#usage)
-   [Bugs, features, feedback](#bugs-features-feedback)

This is an Angular schematic which aims to improve code quality by installing and configuring several useful code checkers, validators and and other automated dev tools.

The goal of this project is to put all the best code quality control tools into one package, providing a way to seamlessly integrate these into any Angular app.

The package has been tested with Angular 7, 8 and 9.

**Please note that this package is currently in BETA.**

## Features

By default, the package does the following. The defaults are printed in **bold**.

Static code analysis / linting:

-   Installs the TypeScript linter of your choice (**TsLint** or EsLint).
-   Installs JSONLint to validate JSON files
-   Installs StyleLint to validate style files (SCSS, CSS, SASS or LESS - **auto detects format**).
-   Installs CommitLint to enforce commit message conventions (**[Angular conventional commit](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines)** format).
-   Can install Markdownlint for Markdown validation (**CommonMark or GFMD**).
-   Can add [Pa11y](https://pa11y.org/) autmated A11Y (WCAG 2.x or Section 508) checker and Codelyzer A11Y rules.
-   Configures all linters using strict and "best practice" linting rules.
-   Creates Git pre-commit hooks for all linters (TS, JS, CSS / SCSS, JSON, MD)
-   Optimizes TypeScript compile time checks by enabling all strict compiler options.

Useful dev tools:

-   Installs and configures Prettier code formatter.
-   Automatically formats all staged files using Prettier.
-   Installs and configures [Webpack Bundle Analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer).
-   Installs and configures [Compodoc](https://compodoc.app/) documentation builder.
-   Can install [Snyk](https://snyk.io) (**free version**) for advanced security vulnerability checks.
-   Can install and configure Cypress for E2E testing, replacing Protractor. This comes with:
    -   TypeScript support, so you can write tests in TS instead of JS,
    -   Istanbul test coverage reports (HTML, text and other formats)
    -   Automatic network caching
    -   A11Y plugins for accessibility E2E testing.
-   Can install and configure [Istanbul](https://istanbul.js.org/) test coverage reporter.
-   Installs all dependencies using the package manager of your choice.
-   Generates NPM / Yarn scripts for all tools.

## Installation

### New Projects

You may generate a new Angular project with all the above extras by running:

```bash
npm i ngx-code-guard
ng new -c ngx-code-guard --name projectName [options]
```

... where "options" means any option you would normally pass to "ng new".

### Existing projects

To add this tool to an existing project, simply do the following:

```bash
ng add ngx-code-guard
ng g ngx-code-guard:codeguard
```

Alternatively, you may also install the package using NPM / Yarn:

```bash
npm i ngx-code-guard --save-dev
```

### Upgrading

Currently, this is only possible via  NPM / Yarn:
```bash
npm up ngx-code-guard
```


## Usage

You may customize the behavior of this tool via various command line options. Almost all of these have meaningful default values, therefore usually you don't need to specify any of them. Run the command below for a list of available options.

```bash
ng g ngx-code-guard:guard --help

or

ng new -c ngx-code-guard --help
```

Once the package is installed, the following useful NPM scripts will be also available (assuming that you've enabled Cypress and A11Y checks too).
Just execute "npm run CMD" or "yarn CMD":

| Command                            | Description                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| guard:analyze ./path/to/stats.json | Starts webpack bundle analyzer. Requires stats JSON data!                                    |
| guard:audit                        | Checks your **prod** dependencies for security vulnerabilities, prints human readable output                                   |
| guard:audit:ci                     | Checks your **prod** dependencies for security vulnerabilities, prints JSON output, ideal for CI                                   |
| guard:audit:dev                    | Checks **all** your dependencies for security vulnerabilities, prints JSON output.                                  |
| guard:lint                         | Runs all linters and checks your source code.                                              |
| guard:a11y                         | Runs automated accessibility (WCAG 2.x / Section 508) checks                                     |
| guard:docs:build                   | Builds project docs using Compodoc                                                              |
| guard:docs:show                    | Opens docs generated by Compodoc using the default browser                              |
| guard:test:headless                | Runs Cypress tests in headless chrome and prints results to console                          |
| guard:test:all                     | Runs Cypress tests in Chrome (executes all test suites)                        |
| guard:test:manual                  | Starts up the Cypress test runner app, allowing you to run test the suite of your choice                   |
| guard:report:text                  | Generates E2E test coverage reports in text format and prints it to console                  |
| guard:report:html                  | Generates E2E test coverage reports in HTML format and loads it using the default browser |
| guard:report:summary               | Generates short E2E test coverage summary report in text format and prints it to console                       |

-   **analyze** requires a stats JSON data file to exist. You can generate that using **ng build --prod --stats-json**.
-   **guard:test:report** requires the tests to be executed with code coverage enabled. See next section!
-   **guard:test and guard:report** are only available if you've enabled Cypress.
-   Using Snyk requires a free account, which you can register [here[(https://snyk.io)

### Test coverage reports

You may run any of the **guard:test:headless, guard:test:manual or guard:test:all** commands with the **-e coverage=true** flag. This will generate test coverage report which you can view in different formats. For example, to create and view the HTML report, run the following:

```bash
npm run guard:test:all -- -e coverage=true && npm run guard:report:html

or

yarn guard:test:all -e coverage=true && yarn guard:report:html
```

It is also possible to generate reports in various formats.

```bash
npx nyc report --reporter=REPORTER_NAME
```

For a list of available reporters, please see [this page](https://istanbul.js.org/docs/advanced/alternative-reporters/).

### Security vulnerability checks

The **guard:audit** command performs Yarn / NPM audit for you. The other audit commands do the same, but they perform more thorough checks and they will also use Snyk (if it's installed). While working on your code, it is recommended to run **guard:audit:dev** form time to time, since it checks all your dependencies for all vulnerabilities. Use **guard:audit:ci** for your prod builds . 

### CI usage

The **guard:lint**, **guard:audit:ci**, **guard:a11y** and **guard:test:headless** commands are ideal for CI usage, since the they return non-zero exit code on error and they print output only to stdout.

### E2E tests: automatic request caching

During E2E tests it is possible to cache network requests, so your app needs to perform them only once and after that each request will be served from the local cache. This can greatly speed up your tests. Enable this feature by changing the following option in **cypress.json**:

```javascript
"autorecord": { "forceRecord": true }
```

Run your tests now and the network requests will be recorded. Set the option to "false" again to stop recording and start using the cached responses.
All subsequent test runs will use the cache until you clear it (by enabling recording again).

For further info on how this works, please see [Cypress autorecord](https://www.npmjs.com/package/cypress-autorecord) plugin docs.

```bash
npm run guard:test:all -- -e report=true
```

## Bugs, features, feedback

Please use our issue tracker to report any bugs, request new features or ask questions.

That's it, have fun! :)
