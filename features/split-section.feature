Feature: The landing page shows what splitting a group dinner will do to your budget
  One big dinner wrecks a month's dining budget. The page shows that with a sample taco dinner of
  $312.00: one tap splits it four ways, the budget bar drops back under its limit because it counts
  only your share, the other three shares stay Pending, and then they flip to paid one by one. The
  feature is not shipped yet, so the section says it is coming soon and that every number is a
  sample. It works with the keyboard, says its before-and-after numbers once to a screen reader, and
  with reduced motion it jumps between states.

  Scenario: The section says it is coming soon and that the numbers are a sample
    Given a visitor is reading the landing page
    When they reach the split section
    Then the section says it is coming soon
    And the section says the numbers are a sample

  Scenario: The sample receipt adds up to the cent before anyone taps
    Given a visitor is reading the landing page
    When they reach the split section
    Then the receipt lines, the tax and the tip add up to $312.00
    And the dining budget of $240.00 is shown over by $72.00

  Scenario: One tap splits the dinner four ways and the budget bar drops back under
    Given the dinner is not split yet
    When the visitor taps "split it 4 ways"
    Then their share is $78.00
    And three friends are shown Pending at $78.00 each, $234.00 in all
    And the dining budget shows $78.00 of $240.00 with $162.00 left
    And a screen reader hears the before and after numbers once

  Scenario: Settling up flips the three friends to paid one by one
    Given the dinner is split four ways
    When the visitor taps "settle up"
    Then Maya, Sam and Jo each flip to paid, one after the other
    And the section says all square
    And nothing is Pending any more

  Scenario: Tapping again takes the split back
    Given the dinner is split four ways
    When the visitor taps the split button again
    Then the dinner is whole again at $312.00 and the budget is over by $72.00

  Scenario: The whole thing works with the keyboard alone
    Given a visitor who only uses the keyboard
    When they tab to "split it 4 ways" and press Enter
    Then the dinner is split four ways
    And focus is still on the button

  Scenario: With reduced motion the states jump and nothing animates
    Given a visitor has asked for reduced motion
    When they tap "split it 4 ways" and then "settle up"
    Then the states change at once and nothing is animating

  Scenario: Without JavaScript the section still says what it shows
    Given a visitor with JavaScript switched off
    When they reach the split section
    Then they can read the receipt and a plain line with the split numbers

  Scenario: The section names no other product and shows only made-up first names
    Given a visitor is reading the landing page
    When they reach the split section
    Then the section names no other app and shows no other company's logo
    And the only people named are Maya, Sam and Jo

  Scenario: Nothing scrolls sideways at any width
    Given a visitor on a 320 pixel wide screen
    When they split the dinner and settle up
    Then nothing scrolls sideways

  Scenario: "What you get today" lists only what is live, and splits as coming soon
    Given a visitor is reading the landing page
    When they read "What you get today"
    Then budgets, with a suggestion, are under "Available right away"
    And no more than six things are under "Available right away"
    And splitting a dinner and settling up are under "Coming soon"
    And rewards are still under "Coming soon" and the investing preview is still under "Later"
