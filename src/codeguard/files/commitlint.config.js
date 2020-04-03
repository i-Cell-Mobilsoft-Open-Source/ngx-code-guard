module.exports = {
  extends: ['<%= commitRule.name %>'],
  <% if(commitRule.args.jira) { %>
  plugins: ['commitlint-plugin-jira-rules'],
  rules: {
    <% if(commitRule.args.light) { %>
    'jira-task-id-project-key': [2, 'never', 0],
    'jira-commit-status-case': [2, 'always', 'uppercase']
    <% } %>
  }
  <% } %>
};
