Feature: Existing tests are locked
  A feature pull request may add tests but never change the ones already there: the tests are
  the judge, and the builder does not edit the judge. A change to an existing test goes in its own
  pull request, titled "Test change: <why>".

  Scenario: Adding a new test is allowed
    Given a branch that adds a new test
    When the integrity check runs with the title "Add the budget view"
    Then the check passes

  Scenario: Editing an existing test is refused
    Given a branch that edits an existing test
    When the integrity check runs with the title "Add the budget view"
    Then the check fails
    And it names the edited test

  Scenario: Deleting an existing test is refused
    Given a branch that deletes an existing test
    When the integrity check runs with the title "Add the budget view"
    Then the check fails
    And it names the deleted test

  Scenario: Renaming an existing test is refused
    Given a branch that renames an existing test
    When the integrity check runs with the title "Add the budget view"
    Then the check fails
    And it names the renamed test

  Scenario: A pull request titled as a test change may edit an existing test
    Given a branch that edits an existing test
    When the integrity check runs with the title "Test change: the rounding rule changed"
    Then the check passes

  Scenario: Without a title the check refuses, rather than guessing
    Given a branch that edits an existing test
    When the integrity check runs with no title
    Then the check fails

  Scenario: Editing something that is not a test is allowed
    Given a branch that edits a file outside the protected set
    When the integrity check runs with no title
    Then the check passes
