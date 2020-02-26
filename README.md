# NGX Code Guard

# Table of Contents

-   [Features](#features)
-   [Installation](#installation)
-   [New Projects](#new-projects)
-   [Existing projects](#existing-projects)
-   [Usage](#usage)
-   [Bugs, features, feedback](#bugs-features-feedback)

This is an Angular schematic which aims to improve code quality in general by installing several useful code checkers, validators and and other automated dev tools.

The goal of this project is to collect all the best code quality control tools in one package, providing a way to seamlessly integrate them into any Angular app.

The package has been tested with Angular 7, 8 and 9.

**Please note that this package is currently in BETA.**

## Features

By default, the package does the following.:

-   Installs the linter of your choice (TsLint or EsLint).
-   Configures the TypeScript / Javascript linter using strict and "best practice" linting rules.
-   Installs JSONLint to validate JSON files
-   Installs StyleLint to validate style files (SCSS, CSS, SASS or LESS).
-   Configures Git pre-commit hooks for all linters (TS, JS, CSS / SCSS, JSON, MD)
-   Optimizes TypeScript compiler config by enabling all strict flags.
-   Installs and configures Prettier code formatter.
-   Automatically formats all staged files using Prettier.
-   Installs and configures Webpack Bundle Analyzer.
-   Installs and configures commitlint to enforce commit message conventions.
-   Installs and configures Compodoc documentation builder.
-   Installs all dependencies using the package manager of your choice.
-   Generates NPM scripts for all tools.

Additionally, this tool can also do the following (and by default, it will):

-   Installs and configures Cypress for E2E testing, replacing Protractor. This comes with:
    -   TypeScript support, so you can write tests in TS instead of JS,
    -   Test coverage reports (HTML, text and other formats)
    -   Automatic network caching
    -   A11Y plugins for accessibility E2E testing.
-   Installs and configures Istanbul test coverage reporter.
-   Adds automated A11Y (WCAG 2.x or Section 508) accessibility checkers.
-   Installs and configures Markdownlint for MD validation.

## Installation

### New Projects

You may generate a new Angular project with all the above extras by running:

```bash
npm i ngx-code-guard
ng new -c ngx-code-guard --name projectName [options]
```

... where "options" means any option you would normally pass to "ng new".

### Existing projects

To add this tool to an existing project, simply execute the following:

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

You may customize the behavior of this tool using various command line options. Almost all of these have meaningful default values, therefore usually you don't need to specify these. However, should you feel the need for it, you may override any flag. Run the command below for a list of all available options.

```bash
ng g ngx-code-guard:guard --help

or

ng new -c ngx-code-guard --help
```

Once the package is installed, in addition to the tools and features described above, the following useful NPM scripts will be also available (assuming that you've enabled Cypress and A11Y checks too).
Just execute "npm run CMD" or "yarn CMD":

| Command                            | Description                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| guard:analyze ./path/to/stats.json | Starts webpack bundle analyzer. Requires stats JSON data!                                    |
| guard:audit                        | Checks your prod dependencies for security vulnerabilities                                   |
| guard:lint                         | Runs the linter and checks TS / JS source code.                                              |
| guard:a11y                         | Runs automated accessibility (WCAG / Section 508) checks                                     |
| guard:docs:build                   | Builds HTML docs using Compodoc                                                              |
| guard:docs:show                    | Opens HTML docs generated by Compodoc using the default browser                              |
| guard:test:headless                | Runs Cypress tests in headless chrome and prints results to console                          |
| guard:test:all                     | Runs Cypress tests in Chrome automatically (executes all test suites)                        |
| guard:test:manual                  | Starts up the Cypress test runner app, allowing you to run test suites manually                   |
| guard:report:text                  | Generates E2E test coverage reports in text format and prints it to console                  |
| guard:report:html                  | Generates E2E test coverage reports in HTML format and loads it using the default browser |
| guard:report:summary               | Generates short summary report in text format and prints it to console                       |

-   **analyze** requires a stats JSON data file to exist. You can generate that using **ng build --prod --stats-json**.
-   **guard:test:report** requires the tests to be executed with code coverage enabled. See next section!
-   **guard:test and guard:report** are only available if you've enabled Cypress.

### Test coverage reports

You may run any of the **guard:test:headless, guard:test:manual or guard:test:all** commands with the **-e coverage=true** flag. This will generate test coverage report which you can view in different formats. For example, to create the HTML report, run the following:

```bash
npm run guard:test:all -- -e coverage=true

or

yarn guard:test:all -e coverage=true
```

It is also possible to generate reports in various different formats.

```bash
npx nyc report --reporter=REPORTER_NAME
```

For a list of available reporters, please see [this page](https://istanbul.js.org/docs/advanced/alternative-reporters/).

### Automatic request caching

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
