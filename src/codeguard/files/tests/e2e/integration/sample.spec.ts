describe('Test Suite', function() {
  const autoRecord = require('cypress-autorecord');
  autoRecord();
  it('Should visit home page', function() {
    cy.visit('/');
  });
})
