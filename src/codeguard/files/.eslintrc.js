module.exports = {
  "env": {
      "browser": true,
      "node": true
  },
  "extends": [
      "plugin:@typescript-eslint/eslint-recommended",
      "plugin:@typescript-eslint/recommended",
      "airbnb-angular"
  ],
  "globals": {},
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
      "ecmaVersion": 5,
      "project": "tsconfig.json",
      "sourceType": "module",
      "ecmaFeatures": {
          "modules": true
      }
  },
  "plugins": [
      "@typescript-eslint",
      "@typescript-eslint/tslint"
  ],
  "settings": {},
  "rules": {
  }
};
