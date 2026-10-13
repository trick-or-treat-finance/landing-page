Feature: Small delights for people who look closely
  The landing page rewards attention with a few quiet jokes. None of them fetches, stores or
  sends anything, none of them moves the page, and each one still works with the keyboard and
  with motion turned off.

  Scenario: Typing "boo" makes the ghost jump and answer
    Given a visitor is reading the landing page
    When they type "boo" without focusing anything
    Then the ghost jumps
    And a short line answers in our voice

  Scenario: Typing a word into a text box or slider does nothing
    Given a visitor is reading the landing page
    When they type "boo" into a slider or a field
    Then the ghost stays where it is

  Scenario: Typing "treat" or "trick" flips the receipt without a mouse
    Given the receipt is showing what the month cost
    When a visitor types "treat"
    Then the receipt shows what the month could buy
    And a line says which side they are on
    When they type "trick"
    Then the receipt shows what the month cost again

  Scenario: October counts the sleeps to Halloween
    Given it is the 11th of October on the visitor's clock
    When the landing page opens
    Then the hint under the buttons says there are 20 sleeps until Halloween

  Scenario: On the day itself the countdown says so
    Given it is the 31st of October on the visitor's clock
    When the landing page opens
    Then the hint under the buttons says Halloween is today

  Scenario: Outside October there is no countdown
    Given it is the 11th of November on the visitor's clock
    When the landing page opens
    Then the hint under the buttons says only that the numbers are examples

  Scenario: Switching to dark mode gets a line, and so does switching back
    Given the page is in light mode
    When a visitor switches to dark mode
    Then a line about the lights going off appears
    When they switch back
    Then a line about the lights coming on appears

  Scenario: The ghost blinks now and then, and not at all with reduced motion
    Given a visitor has not asked for reduced motion
    When the landing page has been open a few seconds
    Then the ghost's eyes close and open again
    Given a visitor has asked for reduced motion
    Then the ghost never blinks

  Scenario: A made-up month gets a one-line reaction
    Given a visitor is building their own month
    When they push the rideshare line to the top of its slider
    Then a short joke about the driver appears under the tally
    When they turn every category off
    Then there is no joke, only the prompt to tap a category

  Scenario: The fine print shrinks as a joke, then catches itself
    Given a visitor scrolls down to the fine print
    When the fine print comes into view
    Then it shrinks a little, as if embarrassed
    And it springs back to full size
    And a line says "kidding. we're not that kind of company."
    And the fine print reads exactly as before

  Scenario: The fine print joke happens once
    Given the fine print has already shrunk and sprung back
    When the visitor scrolls away and returns
    Then the fine print stays at full size

  Scenario: On a phone the fine print is just the fine print
    Given a visitor on a touch screen with no hover
    When the fine print comes into view
    Then it stays at full, readable size
    And no popup appears

  Scenario: With reduced motion the fine print never moves, it only says the line
    Given a visitor has asked for reduced motion
    When the fine print comes into view
    Then the fine print does not shrink
    And a line says "kidding. we're not that kind of company."

  Scenario: Every delight leaves the page in one piece
    Given any of the above has fired
    Then nothing scrolls sideways at 320 pixels and the receipt still flips
