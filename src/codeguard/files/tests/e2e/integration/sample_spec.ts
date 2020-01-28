const autoRecord = require('cypress-autorecord');

describe('Test Suite', function() {
  autoRecord();
  it('Should visit home page', function() {
    cy.visit('/');
  })
})
