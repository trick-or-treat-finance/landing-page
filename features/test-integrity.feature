Feature: Existing tests are locked
  A feature pull request may add tests but never change the ones already there: the tests are
  the judge, and the builder does not edit the judge. A change to an existing test goes in a
  commit whose message starts "Test change: <why>", in its own reviewed pull request. It is
  judged per commit, so that commit never covers the code commits beside it.

  Scenario: Adding a new test passes
    Given a commit that adds a new test
    When the integrity check runs
    Then the check passes

  Scenario: Adding a test to an existing file passes
    Given a commit that appends a test to an existing file
    When the integrity check runs
    Then the check passes

  Scenario: Changing a test this branch added passes
    Given a commit that adds a new test
    And a commit that changes that new test
    When the integrity check runs
    Then the check passes

  Scenario: Editing an existing test fails
    Given a commit that edits an existing test
    When the integrity check runs
    Then the check fails, naming that commit and the test

  Scenario: Deleting an existing test fails
    Given a commit that deletes an existing test
    When the integrity check runs
    Then the check fails, naming that commit and the test

  Scenario: Renaming an existing test fails
    Given a commit that renames an existing test
    When the integrity check runs
    Then the check fails, naming that commit and the test

  Scenario: A commit whose message starts "Test change:" may edit an existing test
    Given a "Test change:" commit that edits an existing test
    When the integrity check runs
    Then the check passes

  Scenario: A "Test change:" commit does not cover the commit after it
    Given a "Test change:" commit that edits an existing test
    And a commit that edits an existing test
    When the integrity check runs
    Then the check fails, naming only the second commit

  Scenario Outline: Turning a test off fails, even in a new test
    Given a commit that adds a new test carrying <marker>
    When the integrity check runs
    Then the check fails, naming the marker

    Examples:
      | marker              |
      | a pytest skip mark  |
      | a pytest xfail mark |
      | a vitest only       |
      | a describe skip     |
      | a test skip         |
      | an XCTest skip      |
      | a disabled trait    |

  Scenario: An uncommitted edit to an existing test fails
    Given an uncommitted edit to an existing test
    When the integrity check runs
    Then the check fails, naming the test

  Scenario: Editing something that is not a test passes
    Given a commit that edits a file outside the protected set
    When the integrity check runs
    Then the check passes

  Scenario: A commit waived on the base passes, and the check says so
    Given a commit that edits an existing test
    And the base waives that commit
    When the integrity check runs
    Then the check passes, naming the waived commit

  Scenario: A waiver covers only the commit it names
    Given a commit that edits an existing test
    And the base waives that commit
    And a commit that edits an existing test
    When the integrity check runs
    Then the check fails, naming only the second commit

  Scenario: A waiver written on the branch itself does not count
    Given a commit that edits an existing test
    And the branch waives that commit
    When the integrity check runs
    Then the check fails, naming the first commit and the test

  Scenario: A malformed waiver fails
    Given a commit that adds a new test
    And the base holds the waiver line "abc123 fixture (approved: god)"
    When the integrity check runs
    Then the check fails, naming the malformed waiver

  Scenario: Reshaping a test this branch appended to an existing file passes
    Given a commit that appends a test to an existing file
    And a commit that changes the appended test
    When the integrity check runs
    Then the check passes
