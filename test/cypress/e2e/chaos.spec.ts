describe('challenge "chaosExperiment"', () => {
  it('should be possible to trigger a CPU intensive calculation via the chaos monkey', () => {
    cy.visit('/')
    cy.window().then(() => {
      cy.request('/rest/chaos-monkey/experiment?monkey=cpu')
        .its('body')
        .should('have.property', 'status', 'success')
      cy.expectChallengeSolved({ challenge: 'Chaos Experiment' })
    })
  })
})